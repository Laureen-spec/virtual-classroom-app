import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import API from "../api/axios";

function LoginPage() {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const res = await API.post("/auth/login", formData);

      // Store token + role
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("role", res.data.role);

      // 🔹 Redirect based on role
      if (res.data.role === "admin") navigate("/admin");
      else if (res.data.role === "teacher") navigate("/teacher");
      else navigate("/student");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed. Check credentials.");
    }
  };

  return (
    <div
      className="flex justify-center items-center min-h-screen bg-cover bg-center relative"
      style={{
        backgroundImage:
          "url('https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=1920&q=80')",
      }}
    >
      {/* Overlay for better text visibility */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/70 via-indigo-800/60 to-purple-700/60"></div>

      <div className="relative z-10 backdrop-blur-md bg-white/15 border border-white/30 shadow-2xl rounded-3xl p-8 w-96 animate-fade-in">
        <h2 className="text-3xl font-extrabold text-center text-white mb-6 drop-shadow-lg">
          Welcome Back 👋
        </h2>

        {error && (
          <p className="text-red-300 text-sm mb-3 text-center animate-pulse">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <input
            type="email"
            name="email"
            placeholder="Email"
            onChange={handleChange}
            className="w-full p-3 rounded-md bg-white/20 text-white placeholder-gray-300 focus:ring-2 focus:ring-blue-400 outline-none shadow-inner"
            required
          />

          {/* Password */}
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="Password"
              onChange={handleChange}
              className="w-full p-3 rounded-md bg-white/20 text-white placeholder-gray-300 focus:ring-2 focus:ring-blue-400 outline-none shadow-inner"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 text-gray-300 hover:text-white"
            >
              {showPassword ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
            </button>
          </div>

          {/* Forgot Password Link */}
          <div className="text-right">
            <Link
              to="/forgot-password"
              className="text-blue-300 text-sm hover:underline hover:text-blue-200"
            >
              Forgot Password?
            </Link>
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2 rounded-lg hover:scale-105 shadow-lg shadow-blue-400/50 transition-all font-semibold"
          >
            Login
          </button>
        </form>

        {/* Register link (default = student) */}
        <p className="text-center mt-5 text-sm text-gray-200">
          Don't have an account?{" "}
          <Link
            to="/register/student"
            className="text-blue-300 font-semibold hover:underline hover:text-blue-200"
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;