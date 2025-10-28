import { useState } from "react";
import { useNavigate, Link, useParams } from "react-router-dom";
import API from "../api/axios";
import { Eye, EyeOff } from "lucide-react"; // 👁️ icons

function RegisterPage() {
  const { role } = useParams(); // 🧠 dynamic role from URL
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ✅ Password validation rule
  const passwordPattern =
    /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const validatePassword = () => {
    if (!passwordPattern.test(formData.password)) {
      setError(
        "Password must be at least 8 characters, include uppercase, lowercase, number, and special character."
      );
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!validatePassword()) return;

    try {
      const userRole = role || "student"; // 🧠 default role if no URL param
      await API.post("/auth/register", {
        name: `${formData.firstName} ${formData.lastName}`,
        email: formData.email,
        password: formData.password,
        role: userRole,
      });

      alert(`✅ ${userRole.charAt(0).toUpperCase() + userRole.slice(1)} registered successfully!`);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
    }
  };

  return (
    <div
      className="flex justify-center items-center min-h-screen bg-cover bg-center relative overflow-hidden"
      style={{
        backgroundImage:
          "url('https://images.unsplash.com/photo-1596496054383-2c8d71d3b98f?auto=format&fit=crop&w=1920&q=80')",
      }}
    >
      {/* Soft gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/70 via-purple-800/60 to-pink-700/60"></div>

      {/* Floating orbs */}
      <div className="absolute w-72 h-72 bg-yellow-400/20 rounded-full blur-3xl top-10 left-10 animate-pulse"></div>
      <div className="absolute w-60 h-60 bg-pink-400/20 rounded-full blur-3xl bottom-10 right-10 animate-pulse"></div>

      {/* Registration Card */}
      <div className="relative z-10 backdrop-blur-md bg-white/15 shadow-2xl rounded-3xl p-8 w-[400px] border border-white/30 animate-fade-in">
        <h2 className="text-3xl font-extrabold text-center text-white mb-6 drop-shadow-lg">
          {role
            ? `🎓 Register as ${role.charAt(0).toUpperCase() + role.slice(1)}`
            : "🏫 Join Virtual Classroom"}
        </h2>

        {error && (
          <p className="text-red-300 text-sm mb-3 text-center animate-pulse">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            name="firstName"
            placeholder="First Name"
            onChange={handleChange}
            className="w-full p-3 rounded-md bg-white/20 text-white placeholder-gray-200 focus:ring-2 focus:ring-pink-300 outline-none"
            required
          />

          <input
            type="text"
            name="lastName"
            placeholder="Last Name"
            onChange={handleChange}
            className="w-full p-3 rounded-md bg-white/20 text-white placeholder-gray-200 focus:ring-2 focus:ring-pink-300 outline-none"
            required
          />

          <input
            type="email"
            name="email"
            placeholder="Email Address"
            onChange={handleChange}
            className="w-full p-3 rounded-md bg-white/20 text-white placeholder-gray-200 focus:ring-2 focus:ring-pink-300 outline-none"
            required
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="Password"
              onChange={handleChange}
              className="w-full p-3 rounded-md bg-white/20 text-white placeholder-gray-200 focus:ring-2 focus:ring-pink-300 outline-none pr-10"
              required
            />
            <div
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 cursor-pointer text-gray-300 hover:text-white"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </div>
          </div>

          <div className="relative">
            <input
              type={showConfirm ? "text" : "password"}
              name="confirmPassword"
              placeholder="Confirm Password"
              onChange={handleChange}
              className="w-full p-3 rounded-md bg-white/20 text-white placeholder-gray-200 focus:ring-2 focus:ring-pink-300 outline-none pr-10"
              required
            />
            <div
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-3 cursor-pointer text-gray-300 hover:text-white"
            >
              {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 shadow-lg shadow-pink-400/40 hover:scale-105 transition-all font-semibold"
          >
            ✨ Register
          </button>
        </form>

        <p className="text-center mt-5 text-sm text-gray-200">
          Already have an account?{" "}
          <Link
            to="/"
            className="text-yellow-300 font-medium hover:underline hover:text-yellow-200"
          >
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;
