// axios.js
import axios from "axios";

const API = axios.create({
  baseURL: "https://virtual-classroom-app-8wbh.onrender.com/api",
});

// ✅ Enhanced interceptor to handle admin authentication
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  // Only skip token for actual register/login API calls
  if (
    token &&
    !config.url.includes("/auth/register") &&
    !config.url.includes("/auth/login")
  ) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// ✅ Enhanced response interceptor to handle admin user ID and 401 errors
API.interceptors.response.use(
  (response) => {
    // If this is a login response, ensure user ID is stored
    if (response.config.url.includes("/auth/login") && response.data.user) {
      const user = response.data.user;
      console.log("🔄 Storing user data after login:", {
        id: user._id || user.id,
        role: user.role,
        name: user.name
      });
      
      // Ensure user ID is stored
      if (user._id || user.id) {
        localStorage.setItem("userId", user._id || user.id);
      }
      if (user.role) {
        localStorage.setItem("role", user.role);
      }
      if (user.name) {
        localStorage.setItem("userName", user.name);
      }
    }
    return response;
  },
  (error) => {
    // ✅ CRITICAL FIX: Prevent automatic redirect for admin 401 errors
    if (error.response?.status === 401) {
      const userRole = localStorage.getItem("role");
      if (userRole === "admin") {
        console.log("🔧 Admin 401 error intercepted - preventing auto redirect");
        // Return a custom error that won't trigger redirect
        return Promise.reject({
          ...error,
          isAdminAuthError: true,
          message: "Admin authentication issue - please check credentials"
        });
      }
    }
    return Promise.reject(error);
  }
);

export default API;