import { useState } from "react";
import { Loader2, X } from "lucide-react";
import axios from "axios";
const BASE_URL = import.meta.env.VITE_BACKEND_URL;

const Modal = ({ isOpen, onClose, isSuccess, message }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md p-6 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h3
            className={`text-xl font-semibold ${
              isSuccess ? "text-green-600" : "text-red-600"
            }`}
          >
            {isSuccess ? "✓ Success!" : "✕ Error"}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-gray-700 mb-6">{message}</p>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 
                     transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 
                     focus:ring-offset-2"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const LoadingOverlay = () => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white p-8 rounded-lg flex flex-col items-center shadow-xl">
      <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
      <p className="mt-4 text-lg font-medium text-gray-700">Synchronizing...</p>
      <p className="mt-2 text-sm text-gray-500">
        Please wait while we process your request
      </p>
    </div>
  </div>
);

const SyncButton = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [message, setMessage] = useState("");

  const handleSync = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`${BASE_URL}/api/sync`);

      console.log(response);

      if (response.status === 200) {
        setIsSuccess(true);
        setMessage(
          response.data.message || "Synchronization completed successfully!"
        );
      } else {
        throw new Error("Sync failed");
      }
    } catch (error) {
      setIsSuccess(false);
      setMessage(
        error.response?.data?.message ||
          error.message ||
          "Failed to synchronize. Please try again."
      );
    } finally {
      setIsLoading(false);
      setShowModal(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-lg">
        <h2 className="text-2xl font-semibold text-center mb-6 text-gray-800">
          Data Synchronization
        </h2>

        <div className="flex justify-center">
          <button
            onClick={handleSync}
            disabled={isLoading}
            className="px-6 py-3 bg-blue-500 text-white text-lg font-medium rounded-lg
                     hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 
                     focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors duration-200 ease-in-out transform hover:scale-105"
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Syncing...
              </span>
            ) : (
              "Sync Now"
            )}
          </button>
        </div>

        {/* Loading Overlay */}
        {isLoading && <LoadingOverlay />}

        {/* Custom Modal */}
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          isSuccess={isSuccess}
          message={message}
        />
      </div>
    </div>
  );
};

export default SyncButton;
