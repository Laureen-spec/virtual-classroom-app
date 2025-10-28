import { useState, useEffect } from "react";
import API from "../api/axios";
import { useNavigate } from "react-router-dom";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const navigate = useNavigate();

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await API.get("/notifications");
      setNotifications(res.data);
    } catch (err) {
      console.error("Error fetching notifications:", err);
      setMessage("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  const markAllAsRead = async () => {
    try {
      await API.put("/notifications/mark-read");
      setMessage("All notifications marked as read");
      // Update local state to mark all as read
      setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
    } catch (err) {
      console.error("Error marking as read:", err);
      setMessage("Failed to mark notifications as read");
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case "student": return "🎓";
      case "teacher": return "👨‍🏫"; 
      case "admin": return "⚡";
      default: return "🔔";
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case "student": return "from-blue-500 to-blue-600";
      case "teacher": return "from-purple-500 to-purple-600";
      case "admin": return "from-red-500 to-red-600";
      default: return "from-gray-500 to-gray-600";
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Notifications</h1>
              <p className="text-gray-600 mt-2">
                Stay updated with your latest activities and reminders
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={fetchNotifications}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                🔄 Refresh
              </button>
              {notifications.length > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  ✅ Mark All Read
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg mb-6 text-center ${
            message.includes("✅") || message.includes("read") 
              ? "bg-green-100 text-green-700 border border-green-300"
              : "bg-red-100 text-red-700 border border-red-300"
          }`}>
            {message}
          </div>
        )}

        {/* Notifications List */}
        <div className="space-y-4">
          {notifications.length > 0 ? (
            notifications.map((notification) => (
              <div
                key={notification._id}
                className={`bg-white rounded-xl shadow-md border-l-4 ${
                  notification.read 
                    ? "border-l-gray-300 opacity-75" 
                    : "border-l-blue-500"
                } transition-all duration-200 hover:shadow-lg`}
              >
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={`text-2xl ${notification.read ? "opacity-50" : ""}`}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1">
                      <p className={`text-lg ${notification.read ? "text-gray-600" : "text-gray-800 font-medium"}`}>
                        {notification.message}
                      </p>
                      <div className="flex items-center gap-4 mt-3">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${getNotificationColor(notification.type)} text-white`}>
                          {notification.type.toUpperCase()}
                        </span>
                        <span className="text-gray-500 text-sm">
                          {new Date(notification.createdAt).toLocaleDateString()} at{" "}
                          {new Date(notification.createdAt).toLocaleTimeString()}
                        </span>
                        {!notification.read && (
                          <span className="inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-16 bg-white rounded-2xl shadow-lg border border-gray-200">
              <div className="text-6xl mb-4">🔔</div>
              <h3 className="text-2xl font-bold text-gray-700 mb-2">No notifications yet</h3>
              <p className="text-gray-500 max-w-md mx-auto">
                You're all caught up! Notifications about your classes, assignments, and updates will appear here.
              </p>
            </div>
          )}
        </div>

        {/* Back to Dashboard */}
        <div className="text-center mt-8">
          <button
            onClick={() => navigate("/dashboard")}
            className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-lg transition-colors inline-flex items-center gap-2"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}