import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children, allowedRoles }) {
  const token = localStorage.getItem("token");
  const userRole = localStorage.getItem("role");

  // 🔐 1. If there's no token, send user to login page
  if (!token) {
    console.warn("🚨 No token found — redirecting to login");
    return <Navigate to="/login" replace />;
  }

  // 🧩 2. If route has role restrictions, verify the user's role
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    console.warn(
      `🚫 Role '${userRole}' not allowed for this route — redirecting to dashboard`
    );

    // Redirect each role to its correct dashboard instead of home
    if (userRole === "student") return <Navigate to="/student" replace />;
    if (userRole === "teacher") return <Navigate to="/teacher" replace />;
    if (userRole === "admin") return <Navigate to="/admin" replace />;
    return <Navigate to="/login" replace />;
  }

  // ✅ 3. User is authenticated and authorized
  return children;
}
