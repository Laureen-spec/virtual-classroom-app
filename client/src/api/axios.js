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

// ✅ Enhanced response interceptor to handle admin user ID
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
    return Promise.reject(error);
  }
);

export default API;