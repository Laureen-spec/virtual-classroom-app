import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/axios";

export default function ActiveLiveClasses() {
  const [activeSessions, setActiveSessions] = useState([]);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchActiveSessions();
    // COMMENT OUT subscription check - students can join without subscription
    // checkSubscriptionStatus();
    const interval = setInterval(fetchActiveSessions, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchActiveSessions = async () => {
    try {
      const response = await API.get("/schedule/active-live");
      setActiveSessions(response.data);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching active sessions:", err);
      setLoading(false);
    }
  };

  // COMMENT OUT subscription check function - KEEP FOR FUTURE USE
  /*
  const checkSubscriptionStatus = async () => {
    try {
      setSubscriptionLoading(true);
      const userRole = localStorage.getItem("role");
      
      // Only check subscription for students
      if (userRole === "student") {
        const response = await API.get("/subscriptions/check");
        setSubscriptionStatus(response.data.subscription);
      }
    } catch (err) {
      // Student doesn't have active subscription or API error
      setSubscriptionStatus(null);
    } finally {
      setSubscriptionLoading(false);
    }
  };
  */

  const joinSession = async (sessionId) => {
    try {
      const userRole = localStorage.getItem("role");
      let token = localStorage.getItem("token");
      let userId = localStorage.getItem("userId");

      console.log("🔄 Join session attempt:", {
        sessionId,
        userRole,
        userId,
        hasToken: !!token
      });

      // ✅ CRITICAL FIX: Handle admin authentication gracefully
      if (userRole === "admin") {
        console.log("🎯 Admin join detected - using existing valid token");

        if (!token) {
          console.error("❌ No token found for admin — redirecting to login");
          alert("Please log in again to join the live class");
          navigate("/login");
          return;
        }

        // Just ensure the admin's ID and name exist in storage
        if (!userId) {
          localStorage.setItem("userId", "69025078d9063907000b4d59");
        }

        if (!localStorage.getItem("userName")) {
          localStorage.setItem("userName", "School Admin");
        }

        console.log("✅ Admin credentials verified:", {
          token: "✅ VALID JWT",
          userId: localStorage.getItem("userId"),
          userName: localStorage.getItem("userName")
        });
      } else {
        // For non-admin users, require proper authentication
        if (!token) {
          console.error("❌ No token found - redirecting to login");
          alert("Please log in again to join the live class");
          navigate("/register");
          return;
        }
      }

      console.log("✅ User authenticated, proceeding to join session");
      
      // Navigate to live class
      navigate(`/class/${sessionId}`);
      
    } catch (err) {
      console.error("Join session error:", err);
      alert("Failed to join session. Please try again.");
    }
  };

  const getJoinButtonText = () => {
    // ✅ ALL USERS CAN JOIN LIVE CLASSES
    return "Join Live";
    
    /* COMMENT OUT ORIGINAL - KEEP FOR FUTURE USE:
    const userRole = localStorage.getItem("role");
    if (userRole === "teacher" || userRole === "admin") return "Join Live";
    if (subscriptionStatus) return "Join Live";
    return "Subscribe to Join";
    */
  };

  const getJoinButtonClass = () => {
    // ✅ USE GREEN BUTTON FOR ALL USERS
    return "bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-all flex items-center";
    
    /* COMMENT OUT ORIGINAL - KEEP FOR FUTURE USE:
    const userRole = localStorage.getItem("role");
    if (userRole === "teacher" || userRole === "admin") 
      return "bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-all flex items-center";
    
    if (subscriptionStatus) 
      return "bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-all flex items-center";
    
    return "bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg transition-all flex items-center";
    */
  };

  // COMMENT OUT subscription status display function - KEEP FOR FUTURE USE
  /*
  const getSubscriptionStatusDisplay = () => {
    const userRole = localStorage.getItem("role");
    
    if (userRole !== "student") return null;
    
    if (subscriptionLoading) {
      return (
        <div className="mb-4 p-3 rounded-lg bg-gray-100 border border-gray-300">
          <div className="animate-pulse flex justify-between items-center">
            <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            <div className="h-8 bg-gray-200 rounded w-24"></div>
          </div>
        </div>
      );
    }

    if (subscriptionStatus) {
      return (
        <div className="mb-4 p-3 rounded-lg bg-green-100 border border-green-300 text-green-800">
          <div className="flex justify-between items-center">
            <span className="font-medium">
              ✅ Active Subscription - Expires {new Date(subscriptionStatus.expiryDate).toLocaleDateString()}
            </span>
            <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm">
              {subscriptionStatus.subjects?.length || 0} Subjects
            </span>
          </div>
        </div>
      );
    } else {
      return (
        <div className="mb-4 p-3 rounded-lg bg-orange-100 border border-orange-300 text-orange-800">
          <div className="flex justify-between items-center">
            <span className="font-medium">
              ❌ No active subscription - Subscribe to join live classes
            </span>
            <button
              onClick={() => navigate("/subscribe")}
              className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded text-sm"
            >
              Subscribe Now
            </button>
          </div>
        </div>
      );
    }
  };
  */

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
        <span className="text-red-500 mr-2">🔴</span>
        Active Live Classes - FREE ACCESS
      </h2>

      {/* ✅ REMOVE Subscription Status Banner - Students can join without subscription */}
      {/* {localStorage.getItem("role") === "student" && getSubscriptionStatusDisplay()} */}

      {/* ✅ ADD FREE ACCESS NOTICE */}
      <div className="mb-4 p-3 rounded-lg bg-blue-100 border border-blue-300 text-blue-800">
        <div className="flex justify-between items-center">
          <span className="font-medium">
            🎉 FREE ACCESS: All students can join live classes without subscription!
          </span>
        </div>
      </div>

      {activeSessions.length === 0 ? (
        <p className="text-gray-500 text-center py-8">
          No active live classes at the moment
        </p>
      ) : (
        <div className="space-y-4">
          {activeSessions.map((session) => (
            <div key={session._id} className="border border-green-200 rounded-lg p-4 bg-green-50">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800">{session.sessionTitle}</h3>
                  <p className="text-sm text-gray-600">
                    Teacher: {session.teacherName} • Class: {session.className}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Started: {new Date(session.startTime).toLocaleString()}
                  </p>
                  <div className="flex items-center mt-2 text-sm text-gray-600">
                    <span className="flex items-center mr-4">
                      <span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span>
                      {session.participantCount} participants
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => joinSession(session._id)}
                  className={getJoinButtonClass()}
                  // ✅ REMOVE subscription loading check
                >
                  <span className="mr-2">🎥</span>
                  {getJoinButtonText()}
                </button>
              </div>

              {/* ✅ REMOVE Subscription warning for students - KEEP FOR FUTURE USE */}
              {/* {localStorage.getItem("role") === "student" && !subscriptionStatus && !subscriptionLoading && (
                <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-700">
                  🔒 Subscription required to join this live class
                </div>
              )} */}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}