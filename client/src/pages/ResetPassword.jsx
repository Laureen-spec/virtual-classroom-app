import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import API from "../api/axios";

function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: ""
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tokenValid, setTokenValid] = useState(false);

  // Password validation rule (same as register)
  const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;

  // Verify token on component mount
  useEffect(() => {
    const verifyToken = async () => {
      try {
        const res = await API.get(`/auth/verify-reset-token/${token}`);
        setTokenValid(res.data.valid);
      } catch (err) {
        setError("Invalid or expired reset token");
        setTokenValid(false);
      } finally {
        setVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const validatePassword = () => {
    if (!passwordPattern.test(formData.password)) {
      setError("Password must be at least 8 characters, include uppercase, lowercase, number, and special character.");
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
    setSuccess("");

    if (!validatePassword()) return;

    setLoading(true);
    try {
      const res = await API.post(`/auth/reset-password/${token}`, {
        password: formData.password
      });

      setSuccess(res.data.message);
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate("/");
      }, 3000);
      
    } catch (err) {
      setError(err.response?.data?.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-blue-900 to-indigo-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
          <p className="mt-4 text-white">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div
        className="flex justify-center items-center min-h-screen bg-cover bg-center relative"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=1920&q=80')",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/70 via-indigo-800/60 to-purple-700/60"></div>
        
        <div className="relative z-10 backdrop-blur-md bg-white/15 border border-white/30 shadow-2xl rounded-3xl p-8 w-96 text-center">
          <h2 className="text-3xl font-extrabold text-white mb-4">❌ Invalid Link</h2>
          <p className="text-gray-200 mb-6">
            This password reset link is invalid or has expired.
          </p>
          <Link
            to="/forgot-password"
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2 rounded-lg hover:scale-105 transition-all font-semibold inline-block"
          >
            Get New Link
          </Link>
          <p className="text-center mt-5 text-sm text-gray-200">
            <Link
              to="/"
              className="text-blue-300 font-semibold hover:underline hover:text-blue-200"
            >
              Back to Login
            </Link>
          </p>
        </div>
      </div>
    );
  }

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
          🔑 Reset Password
        </h2>

        {error && (
          <p className="text-red-300 text-sm mb-3 text-center animate-pulse">
            {error}
          </p>
        )}

        {success && (
          <div className="bg-green-500/20 border border-green-400 rounded-lg p-3 mb-4">
            <p className="text-green-300 text-sm text-center">
              {success}
            </p>
            <p className="text-green-200 text-xs text-center mt-1">
              Redirecting to login...
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New Password */}
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="New Password"
              value={formData.password}
              onChange={handleChange}
              className="w-full p-3 rounded-md bg-white/20 text-white placeholder-gray-300 focus:ring-2 focus:ring-blue-400 outline-none shadow-inner pr-10"
              required
              disabled={success}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 text-gray-300 hover:text-white"
            >
              {showPassword ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
            </button>
          </div>

          {/* Confirm Password */}
          <div className="relative">
            <input
              type={showConfirm ? "text" : "password"}
              name="confirmPassword"
              placeholder="Confirm New Password"
              value={formData.confirmPassword}
              onChange={handleChange}
              className="w-full p-3 rounded-md bg-white/20 text-white placeholder-gray-300 focus:ring-2 focus:ring-blue-400 outline-none shadow-inner pr-10"
              required
              disabled={success}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-3 text-gray-300 hover:text-white"
            >
              {showConfirm ? <EyeOffIcon size={20} /> : <EyeIcon size={20} />}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || success}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2 rounded-lg hover:scale-105 shadow-lg shadow-blue-400/50 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Resetting..." : success ? "Password Reset!" : "Reset Password"}
          </button>
        </form>

        {/* Back to login */}
        <p className="text-center mt-5 text-sm text-gray-200">
          <Link
            to="/"
            className="text-blue-300 font-semibold hover:underline hover:text-blue-200"
          >
            Back to Login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default ResetPassword;