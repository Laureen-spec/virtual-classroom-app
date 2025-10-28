import { useEffect, useState } from "react";
import API from "../api/axios";

export default function AdminReports() {
  const [report, setReport] = useState({
    totalTeachers: 0,
    totalStudents: 0,
    totalClasses: 0,
    totalSubscriptions: 0,
    totalRevenue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await API.get("/admin/reports");
        setReport(res.data);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching reports:", err);
        setLoading(false);
      }
    };
    fetchReport();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <p className="text-xl text-gray-700">Generating Report...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-3xl font-bold text-indigo-600 mb-6">📊 Admin Reports</h1>

      <div className="grid md:grid-cols-3 sm:grid-cols-2 gap-4">
        <div className="bg-white p-5 shadow rounded-2xl text-center">
          <h2 className="text-gray-600 text-sm">Total Teachers</h2>
          <p className="text-3xl font-bold text-indigo-600">{report.totalTeachers}</p>
        </div>
        <div className="bg-white p-5 shadow rounded-2xl text-center">
          <h2 className="text-gray-600 text-sm">Total Students</h2>
          <p className="text-3xl font-bold text-indigo-600">{report.totalStudents}</p>
        </div>
        <div className="bg-white p-5 shadow rounded-2xl text-center">
          <h2 className="text-gray-600 text-sm">Total Classes</h2>
          <p className="text-3xl font-bold text-indigo-600">{report.totalClasses}</p>
        </div>
        <div className="bg-white p-5 shadow rounded-2xl text-center">
          <h2 className="text-gray-600 text-sm">Total Subscriptions</h2>
          <p className="text-3xl font-bold text-indigo-600">{report.totalSubscriptions}</p>
        </div>
        <div className="bg-white p-5 shadow rounded-2xl text-center">
          <h2 className="text-gray-600 text-sm">Total Revenue (KES)</h2>
          <p className="text-3xl font-bold text-green-600">{report.totalRevenue}</p>
        </div>
      </div>
    </div>
  );
}
