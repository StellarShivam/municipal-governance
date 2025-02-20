const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const twilio = require("twilio");
require("pdfkit-table");

const formatKey = (key) => {
  return key
    .replace(/\s+/g, "") // Remove spaces
    .replace(/[^a-zA-Z0-9]/g, "") // Remove special characters
    .replace(/^[0-9]+/, ""); // Remove leading numbers if any
};

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Function to send WhatsApp message
const sendWhatsAppMessage = async (toNumber, fileName, fileLink) => {
  try {
    const message = await twilioClient.messages.create({
      from: "whatsapp:" + process.env.TWILIO_WHATSAPP_NUMBER, // Twilio WhatsApp sender
      to: "whatsapp:" + toNumber, // Receiver's WhatsApp number
      body: `📄 *New PDF Report Available!* \n\nFile: ${fileName}\n🔗 Link: ${fileLink}`,
    });

    console.log(`📲 WhatsApp message sent: ${message.sid}`);
  } catch (error) {
    console.error("❌ Error sending WhatsApp message:", error);
  }
};

// Google Drive authentication setup
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

// Upload file to Google Drive and send WhatsApp message
const uploadFileToDrive = async (filePath, fileName, recipientWhatsApp) => {
  try {
    // Search for existing file
    const response = await drive.files.list({
      q: `name='${fileName}' and '${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed=false`,
      fields: "files(id, webViewLink)",
    });

    const files = response.data.files;
    let fileId = files.length > 0 ? files[0].id : null;
    let fileLink = "";

    if (fileId) {
      // Update existing file
      const media = {
        mimeType: "application/pdf",
        body: fs.createReadStream(filePath),
      };
      await drive.files.update({ fileId: fileId, media: media });

      fileLink = files[0].webViewLink;
      console.log(`🔄 PDF updated in Google Drive: ${fileName}`);
    } else {
      // Upload new file
      const fileMetadata = {
        name: fileName,
        parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
      };
      const media = {
        mimeType: "application/pdf",
        body: fs.createReadStream(filePath),
      };
      const uploadResponse = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: "id, webViewLink",
      });

      fileLink = uploadResponse.data.webViewLink;
      console.log(`📤 New PDF uploaded to Google Drive: ${fileName}`);
    }

    console.log(`📎 Link: ${fileLink}`);

    // Send WhatsApp notification
    if (recipientWhatsApp) {
      await sendWhatsAppMessage(recipientWhatsApp, fileName, fileLink);
    }
  } catch (error) {
    console.error("❌ Error uploading/updating PDF to Google Drive:", error);
  }
};

exports.syncGoogleSheetData = async () => {
  try {
    console.log("🔄 Fetching all Google Sheets data...");

    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();

    for (let sheet of doc.sheetsByIndex) {
      console.log(`📄 Processing Sheet: ${sheet.title}`);

      await sheet.loadHeaderRow();
      const headerValues = sheet.headerValues.map(formatKey);
      const rows = await sheet.getRows();

      const sheetData = rows.map((row) => {
        let formattedRow = {};
        headerValues.forEach((key, index) => {
          let value = row._rawData[index] || "";
          if (!isNaN(value) && value !== "") value = parseInt(value, 10);
          formattedRow[key] = value;
        });
        return formattedRow;
      });

      if (sheetData.length > 0) {
        const collectionName = `sheet_${sheet.title.replace(/\s+/g, "_")}`;
        const dynamicCollection =
          mongoose.connection.collection(collectionName);

        await dynamicCollection.deleteMany({});
        await dynamicCollection.insertMany(sheetData);

        console.log(`✅ Data stored in collection: ${collectionName}`);
      } else {
        console.log(`⚠️ Sheet ${sheet.title} is empty, skipping storage.`);
      }
    }

    console.log("✅ All sheets processed successfully!");
  } catch (error) {
    console.error("❌ Error syncing data:", error);
  }
};

exports.syncGoogleSheetToPDF = async () => {
  try {
    console.log("🔄 Fetching all Google Sheets data...");

    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();

    for (let sheet of doc.sheetsByIndex) {
      console.log(`📄 Processing Sheet: ${sheet.title}`);

      await sheet.loadHeaderRow();
      const headerValues = sheet.headerValues;
      const rows = await sheet.getRows();

      const sheetData = rows.map((row) => {
        let formattedRow = {};
        headerValues.forEach((header, index) => {
          let value = row._rawData[index] || "";
          formattedRow[header] =
            isNaN(value) || value === "" ? value : parseInt(value, 10);
        });
        return formattedRow;
      });

      if (sheetData.length > 0) {
        const pdfPath = await generateTablePDF(
          sheet.title,
          headerValues,
          sheetData
        );
        await uploadFileToDrive(
          pdfPath,
          `${sheet.title}.pdf`,
          process.env.TWILIO_RECIEVER_WHATSAPP_NUMBER
        );
      } else {
        console.log(`⚠️ Sheet ${sheet.title} is empty, skipping PDF creation.`);
      }
    }

    console.log(
      "✅ All sheets converted to PDFs and uploaded to Google Drive!"
    );
  } catch (error) {
    console.error("❌ Error syncing data to PDF:", error);
  }
};

const generateTablePDF = async (fileName, headers, data) => {
  const pdfPath = path.join(__dirname, "pdfs", `${fileName}.pdf`);

  if (!fs.existsSync(path.dirname(pdfPath))) {
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  }

  const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape" });
  const writeStream = fs.createWriteStream(pdfPath);
  doc.pipe(writeStream);

  // Title
  doc.fontSize(16).text(`Google Sheet: ${fileName}`, { align: "center" });
  doc.moveDown(2);

  // Page dimensions
  const pageWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const pageHeight =
    doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
  const startX = doc.page.margins.left;
  let startY = 100; // Adjusted for title

  const padding = 5;
  const baseRowHeight = 25; // Minimum row height
  const maxRowsPerPage = Math.floor((pageHeight - startY - 50) / baseRowHeight);

  // Adjust font size based on column count
  let fontSize = 10;
  if (headers.length > 8) fontSize = 8;
  if (headers.length > 12) fontSize = 6;

  // Ensure all columns fit within the page width
  let columnWidth = pageWidth / headers.length;

  // Helper function to split text into lines that fit within a given width
  const splitTextIntoLines = (text, width, fontSize) => {
    const words = text.split(" ");
    let lines = [];
    let line = "";

    doc.fontSize(fontSize);
    words.forEach((word) => {
      const testLine = line + (line ? " " : "") + word;
      const testWidth = doc.widthOfString(testLine);
      if (testWidth < width - 2 * padding) {
        line = testLine;
      } else {
        lines.push(line);
        line = word;
      }
    });

    if (line) lines.push(line);
    return lines;
  };

  // Function to draw headers with dynamic row height
  const drawHeaders = () => {
    doc.font("Helvetica-Bold").fontSize(fontSize);
    let x = startX;
    let headerRowHeight = baseRowHeight; // Start with the base row height

    // Calculate the height of each header based on text wrapping
    headers.forEach((header) => {
      const lines = splitTextIntoLines(header, columnWidth, fontSize);
      const headerHeight = lines.length * (fontSize + 2) + padding * 2;
      headerRowHeight = Math.max(headerRowHeight, headerHeight);
    });

    // Draw the header cells with dynamic height
    headers.forEach((header) => {
      doc.rect(x, startY, columnWidth, headerRowHeight).stroke();
      const lines = splitTextIntoLines(header, columnWidth, fontSize);
      let textY = startY + padding;
      lines.forEach((line) => {
        doc.text(line, x + padding, textY, {
          width: columnWidth - 2 * padding,
          align: "center",
        });
        textY += fontSize + 2;
      });
      x += columnWidth;
    });

    return headerRowHeight;
  };

  // Function to calculate row height dynamically
  const getRowHeight = (row) => {
    let maxHeight = baseRowHeight;
    headers.forEach((header) => {
      const text = row[header] ? String(row[header]) : "N/A";
      const lines = splitTextIntoLines(text, columnWidth, fontSize);
      const textHeight = lines.length * (fontSize + 2) + padding * 2;
      maxHeight = Math.max(maxHeight, textHeight);
    });
    return maxHeight;
  };

  // Function to draw a row
  const drawRow = (row, yPosition) => {
    doc.font("Helvetica").fontSize(fontSize);
    let x = startX;
    const rowHeight = getRowHeight(row);

    headers.forEach((header) => {
      const text = row[header] ? String(row[header]) : "N/A";
      const lines = splitTextIntoLines(text, columnWidth, fontSize);

      doc.rect(x, yPosition, columnWidth, rowHeight).stroke();

      let textY = yPosition + padding;
      lines.forEach((line) => {
        doc.text(line, x + padding, textY, {
          width: columnWidth - 2 * padding,
          align: "left",
        });
        textY += fontSize + 2;
      });

      x += columnWidth;
    });

    return rowHeight;
  };

  // Draw headers
  const headerRowHeight = drawHeaders();
  startY += headerRowHeight;

  let rowCount = 0;

  // Draw rows with text wrapping & dynamic row height
  data.forEach((row) => {
    const rowHeightUsed = getRowHeight(row);

    if (rowCount >= maxRowsPerPage || startY + rowHeightUsed > pageHeight) {
      doc.addPage();
      startY = 100;
      drawHeaders();
      startY += headerRowHeight;
      rowCount = 0;
    }

    drawRow(row, startY);
    startY += rowHeightUsed;
    rowCount++;
  });

  doc.end();

  return new Promise((resolve) => {
    writeStream.on("finish", () => {
      console.log(`📄 PDF saved: ${pdfPath}`);
      resolve(pdfPath);
    });
  });
};
