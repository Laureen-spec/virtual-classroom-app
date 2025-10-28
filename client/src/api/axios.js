import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:5000/api", // backend base path
});

// ✅ Automatically attach token to all secured routes
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

export default API;