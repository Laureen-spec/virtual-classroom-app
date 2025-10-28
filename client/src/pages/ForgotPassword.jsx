import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import API from "../api/axios";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await API.post("/auth/forgot-password", { email });
      
      setSuccess(res.data.message);
      console.log("🔗 Reset URL (for testing):", res.data.resetUrl);
      
      // For development - show the reset link
      if (res.data.resetUrl) {
        setSuccess(prev => prev + " Check console for reset link.");
      }
      
    } catch (err) {
      setError(err.response?.data?.message || "Failed to process request");
    } finally {
      setLoading(false);
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
          🔐 Forgot Password
        </h2>

        <p className="text-gray-200 text-sm text-center mb-6">
          Enter your email address and we'll send you a link to reset your password.
        </p>

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
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <input
            type="email"
            name="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 rounded-md bg-white/20 text-white placeholder-gray-300 focus:ring-2 focus:ring-blue-400 outline-none shadow-inner"
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2 rounded-lg hover:scale-105 shadow-lg shadow-blue-400/50 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        {/* Back to login */}
        <p className="text-center mt-5 text-sm text-gray-200">
          Remember your password?{" "}
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

export default ForgotPassword;