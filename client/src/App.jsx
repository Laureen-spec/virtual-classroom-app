import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import StudentDashboard from "./pages/StudentDashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import LiveClass from "./pages/Liveclass.jsx";
import SchedulePage from "./pages/SchedulePage.jsx";
import AdminReports from "./pages/AdminReports";
import SubscriptionPage from "./pages/SubscriptionPage";
import UploadAssignment from "./pages/UploadAssignment.jsx";
import TeacherUploadMaterial from "./pages/TeacherUploadMaterial.jsx";
import ReviewSubmissions from "./pages/ReviewSubmissions.jsx";
import NotesList from "./pages/NotesList.jsx";
import NotesUpload from "./pages/NotesUpload.jsx";
import Results from "./pages/Results";
import TimetablePage from "./pages/TimetablePage";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotificationsPage from "./pages/NotificationsPage";
import ProtectedRoute from "./routes/ProtectedRoute";
import ChangePassword from "./pages/ChangePassword"; // ✅ ADDED

function App() {
  return (
    <Router>
      <Routes>
        {/* 🔹 Auth */}
        <Route path="/" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/register/:role" element={<RegisterPage />} />

        {/* 🔹 Password Recovery */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />

        {/* 🔹 ADDED: Change Password Route */}
        <Route
          path="/change-password"
          element={
            <ProtectedRoute allowedRoles={["student", "teacher", "admin"]}>
              <ChangePassword />
            </ProtectedRoute>
          }
        />

        {/* 🔹 Dashboards (Protected) */}
        <Route
          path="/student"
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <StudentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher"
          element={
            <ProtectedRoute allowedRoles={["teacher"]}>
              <TeacherDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        {/* 🔹 Class & Schedule */}
        <Route
          path="/class/:sessionId"
          element={
            <ProtectedRoute allowedRoles={["student", "teacher"]}>
              <LiveClass />
            </ProtectedRoute>
          }
        />
        <Route
          path="/schedule"
          element={
            <ProtectedRoute allowedRoles={["teacher", "student", "admin"]}>
              <SchedulePage />
            </ProtectedRoute>
          }
        />

        {/* 🔹 Admin Reports */}
        <Route
          path="/admin/reports"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminReports />
            </ProtectedRoute>
          }
        />

        {/* 🔹 Subscriptions */}
        <Route
          path="/subscribe"
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <SubscriptionPage />
            </ProtectedRoute>
          }
        />

        {/* 🔹 Uploads & Reviews */}
        <Route
          path="/upload-assignment"
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <UploadAssignment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/upload-material"
          element={
            <ProtectedRoute allowedRoles={["teacher"]}>
              <TeacherUploadMaterial />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/review-submissions"
          element={
            <ProtectedRoute allowedRoles={["teacher"]}>
              <ReviewSubmissions />
            </ProtectedRoute>
          }
        />

        {/* 🔹 Notes & Results */}
        <Route
          path="/upload-notes"
          element={
            <ProtectedRoute allowedRoles={["teacher"]}>
              <NotesUpload />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notes"
          element={
            <ProtectedRoute allowedRoles={["student", "teacher"]}>
              <NotesList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/results"
          element={
            <ProtectedRoute allowedRoles={["student", "teacher", "admin"]}>
              <Results />
            </ProtectedRoute>
          }
        />
        <Route
          path="/timetable"
          element={
            <ProtectedRoute allowedRoles={["student", "teacher", "admin"]}>
              <TimetablePage />
            </ProtectedRoute>
          }
        />

        {/* 🔹 NOTIFICATIONS */}
        <Route
          path="/notifications"
          element={
            <ProtectedRoute allowedRoles={["student", "teacher", "admin"]}>
              <NotificationsPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;