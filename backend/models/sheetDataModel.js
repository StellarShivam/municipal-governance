const mongoose = require("mongoose");

const PropertySchema = new mongoose.Schema({
  timestamp: { type: String },
  householdOwnerName: { type: String },
  fatherOrHusbandName: { type: String },
  holdingNoOld: { type: Number },
  buildingName: { type: String },
  streetAddressOrStreetName: { type: String },
  roadClassification: { type: String },
  newUIDAllotted: { type: String },
  buildingUse: { type: String },
  typeOfConstruction: { type: String },
  totalHouseholdAreaSqFeet: { type: Number },
  openLandAreaSqFeet: { type: Number },
  noOfFloors: { type: Number },
  noOfRooms: { type: Number },
  wardNumber: { type: Number },
  isPropertyRented: { type: String },
  tenantDetails: { type: String },
  yearOfConstruction: { type: Number },
  yearOfAlteration: { type: Number },
  mobileNumber: { type: Number },
  emailAddress: { type: String },
});

const Property = mongoose.model("Property", PropertySchema);

module.exports = Property;
