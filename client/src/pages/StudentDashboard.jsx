import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/axios";
import ActiveLiveClasses from "../components/ActiveLiveClasses";
// import NotificationBell from "./components/NotificationBell"; // COMMENTED OUT

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [subscriptions, setSubscriptions] = useState([]);
  const [classes, setClasses] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // ADDED: Mobile menu state

  // 🔹 Logout
  const handleLogout = () => {
    localStorage.clear();
    navigate("/register");
  };

  // 🔹 Navigation buttons - UPDATED: Close mobile menu on navigation
  const goToSchedule = () => { navigate("/schedule"); setIsMobileMenuOpen(false); };
  const goToSubscribe = () => { navigate("/subscribe"); setIsMobileMenuOpen(false); };
  const goToUploadAssignment = () => { navigate("/upload-assignment"); setIsMobileMenuOpen(false); };
  const goToNotes = () => { navigate("/notes"); setIsMobileMenuOpen(false); };
  const goToResults = () => { navigate("/results"); setIsMobileMenuOpen(false); };
  const goToTimetable = () => { navigate("/timetable"); setIsMobileMenuOpen(false); };
  const goToNotifications = () => { navigate("/notifications"); setIsMobileMenuOpen(false); };
  const goToChangePassword = () => { navigate("/change-password"); setIsMobileMenuOpen(false); };

  // Check subscription status function - UPDATED: Better error handling
  const checkSubscriptionStatus = async () => {
    try {
      const response = await API.get("/subscriptions/check");
      // subscription can be null
      setSubscriptionStatus(response.data.subscription || null);
    } catch (err) {
      console.error("Error checking subscription:", err);
      setSubscriptionStatus(null);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const subRes = await API.get("/subscriptions");
        setSubscriptions(subRes.data);

        const classRes = await API.get("/schedule/upcoming");
        setClasses(classRes.data);

        const notifRes = await API.get("/notifications");
        setNotifications(notifRes.data);

        // Check subscription status
        await checkSubscriptionStatus();

        setLoading(false);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-green-50">
        <p className="text-xl text-gray-700">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-green-50 p-4 sm:p-6"> {/* UPDATED: Responsive padding */}
      
      {/* Top Bar - UPDATED: Mobile responsive */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex justify-between items-center w-full sm:w-auto">
          <h1 className="text-2xl sm:text-3xl font-bold text-green-600">🎓 Student Dashboard</h1>
          {/* Mobile Menu Button - ADDED */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="sm:hidden bg-green-500 text-white p-2 rounded-lg"
          >
            {isMobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>

        {/* Desktop Navigation - UPDATED: Hidden on mobile */}
        <div className="hidden sm:flex items-center gap-2 lg:gap-3 flex-wrap">
          {/* <NotificationBell /> COMMENTED OUT */}
          
          <button
            onClick={goToNotifications}
            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-md text-sm lg:text-base"
          >
            🔔 Notifications
          </button>

          <button
            onClick={goToChangePassword}
            className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-md text-sm lg:text-base"
          >
            🔐 Change Password
          </button>

          <button
            onClick={goToNotes}
            className="bg-emerald-500 text-white px-3 py-2 rounded hover:bg-emerald-600 shadow-md text-sm lg:text-base"
          >
            📘 Notes
          </button>

          <button
            onClick={goToUploadAssignment}
            className="bg-yellow-500 text-white px-3 py-2 rounded hover:bg-yellow-600 shadow-md text-sm lg:text-base"
          >
            🧾 Upload
          </button>

          <button
            onClick={goToResults}
            className="bg-purple-500 text-white px-3 py-2 rounded hover:bg-purple-600 shadow-md text-sm lg:text-base"
          >
            🧮 Marks
          </button>

          <button
            onClick={goToSubscribe}
            className="bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700 shadow-md text-sm lg:text-base"
          >
            💳 Subscribe
          </button>

          <button
            onClick={goToSchedule}
            className="bg-blue-500 text-white px-3 py-2 rounded hover:bg-blue-600 shadow-md text-sm lg:text-base"
          >
            📅 Schedule
          </button>

          <button
            onClick={goToTimetable}
            className="bg-indigo-500 text-white px-3 py-2 rounded hover:bg-indigo-600 shadow-md text-sm lg:text-base"
          >
            🗓️ Timetable
          </button>

          <button
            onClick={handleLogout}
            className="bg-red-500 text-white px-3 py-2 rounded hover:bg-red-600 shadow-md text-sm lg:text-base"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Mobile Navigation Menu - ADDED */}
      {isMobileMenuOpen && (
        <div className="sm:hidden bg-white rounded-xl p-4 mb-4 shadow-lg border border-green-200">
          <div className="grid grid-cols-2 gap-2">
            {/* <NotificationBell /> COMMENTED OUT */}
            <button
              onClick={goToNotifications}
              className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded-lg transition-colors flex items-center justify-center gap-1 text-xs"
            >
              🔔 Notifications
            </button>
            <button
              onClick={goToChangePassword}
              className="bg-gray-600 hover:bg-gray-700 text-white p-2 rounded-lg transition-colors flex items-center justify-center gap-1 text-xs"
            >
              🔐 Password
            </button>
            <button
              onClick={goToNotes}
              className="bg-emerald-500 text-white p-2 rounded hover:bg-emerald-600 shadow-md text-xs"
            >
              📘 Notes
            </button>
            <button
              onClick={goToUploadAssignment}
              className="bg-yellow-500 text-white p-2 rounded hover:bg-yellow-600 shadow-md text-xs"
            >
              🧾 Upload
            </button>
            <button
              onClick={goToResults}
              className="bg-purple-500 text-white p-2 rounded hover:bg-purple-600 shadow-md text-xs"
            >
              🧮 Marks
            </button>
            <button
              onClick={goToSubscribe}
              className="bg-green-600 text-white p-2 rounded hover:bg-green-700 shadow-md text-xs"
            >
              💳 Subscribe
            </button>
            <button
              onClick={goToSchedule}
              className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600 shadow-md text-xs"
            >
              📅 Schedule
            </button>
            <button
              onClick={goToTimetable}
              className="bg-indigo-500 text-white p-2 rounded hover:bg-indigo-600 shadow-md text-xs"
            >
              🗓️ Timetable
            </button>
            <button
              onClick={handleLogout}
              className="bg-red-500 text-white p-2 rounded hover:bg-red-600 shadow-md text-xs col-span-2"
            >
              Logout
            </button>
          </div>
        </div>
      )}

      {/* SUBSCRIPTION STATUS BANNER - UPDATED: Mobile responsive */}
      {!subscriptionStatus && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex-1">
              <h3 className="font-semibold text-orange-800 text-lg sm:text-base">🎓 Unlock Live Classes</h3>
              <p className="text-orange-600 text-sm mt-1">
                Subscribe now to access live classes, interactive sessions, and real-time learning.
              </p>
            </div>
            <button
              onClick={() => navigate("/subscribe")}
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition-all w-full sm:w-auto mt-2 sm:mt-0"
            >
              Subscribe Now
            </button>
          </div>
        </div>
      )}

      {subscriptionStatus && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex-1">
              <h3 className="font-semibold text-green-800 text-lg sm:text-base">✅ Active Subscription</h3>
              <p className="text-green-600 text-sm mt-1">
                Expires on: {new Date(subscriptionStatus.expiryDate).toLocaleDateString()}
              </p>
              <p className="text-green-500 text-xs mt-1">
                Subjects: {subscriptionStatus.subjects?.join(", ") || "All subjects"}
              </p>
            </div>
            <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm mt-2 sm:mt-0 self-start sm:self-auto">
              {subscriptionStatus.subjects?.length || 0} Subjects
            </span>
          </div>
        </div>
      )}

      {/* 🔴 ACTIVE LIVE CLASSES SECTION */}
      <div className="mb-6">
        <ActiveLiveClasses />
      </div>

      {/* Subscriptions Section - UPDATED: Mobile responsive */}
      <div className="bg-white rounded-2xl shadow p-4 mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-green-700 mb-3">
          📆 Your Subscriptions
        </h2>
        {subscriptions.length > 0 ? (
          <ul className="space-y-3">
            {subscriptions.map((sub) => (
              <li
                key={sub._id}
                className="border-b border-gray-200 pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <div className="flex-1">
                    <span className="font-medium text-gray-800 text-sm sm:text-base">
                      {sub.planType} —{" "}
                      <span
                        className={
                          sub.status === "active" ? "text-green-600" : "text-red-600"
                        }
                      >
                        {sub.status}
                      </span>
                    </span>
                  </div>
                  <span className="text-gray-600 text-xs sm:text-sm">
                    Expires: {new Date(sub.expiryDate).toLocaleDateString("en-GB")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-center py-4">No subscriptions found.</p>
        )}
      </div>

      {/* Classes Section - UPDATED: Mobile responsive */}
      <div className="bg-white rounded-2xl shadow p-4 mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-green-700 mb-3">
          📚 Upcoming Classes
        </h2>
        {classes.length > 0 ? (
          <ul className="space-y-4">
            {classes.map((c) => (
              <li key={c._id} className="border-b border-gray-200 pb-4 last:border-b-0 last:pb-0">
                <div className="space-y-2">
                  <p className="font-semibold text-gray-800 text-sm sm:text-base">{c.title}</p>
                  <p className="text-xs sm:text-sm text-gray-500">
                    {new Date(c.startTime).toLocaleString("en-GB", { timeZone: "UTC" })} —{" "}
                    {new Date(c.endTime).toLocaleString("en-GB", { timeZone: "UTC" })}
                  </p>
                  <p className="text-gray-600 text-xs sm:text-sm">Teacher: {c.teacher?.name}</p>

                  <button
                    onClick={() => navigate(`/class/${c._id}`)}
                    className="bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 w-full sm:w-auto"
                  >
                    🎥 Join Class
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-center py-4">No upcoming classes found.</p>
        )}
      </div>

      {/* Notifications Section - UPDATED: Mobile responsive */}
      <div className="bg-white rounded-2xl shadow p-4">
        <h2 className="text-lg sm:text-xl font-semibold text-green-700 mb-3">
          🔔 Recent Notifications
        </h2>
        {notifications.length > 0 ? (
          <ul className="space-y-3">
            {notifications.slice(0, 3).map((n) => ( // Show only 3 recent notifications
              <li
                key={n._id}
                className={`border-b border-gray-200 pb-3 last:border-b-0 last:pb-0 ${
                  n.read ? "text-gray-400" : "text-gray-700 font-medium"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-1 flex-shrink-0">🔔</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-base break-words">{n.message}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(n.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </li>
            ))}
            {notifications.length > 3 && (
              <li className="text-center pt-2">
                <button
                  onClick={goToNotifications}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  View all {notifications.length} notifications →
                </button>
              </li>
            )}
          </ul>
        ) : (
          <div className="text-center py-6 text-gray-500">
            <p className="mb-2">No notifications yet</p>
            <button
              onClick={goToNotifications}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Check notifications page
            </button>
          </div>
        )}
      </div>
    </div>
  );
}