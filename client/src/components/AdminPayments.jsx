import { useEffect, useState } from "react";
import API from "../api/axios";

export default function AdminPayments() {
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchPayments = async () => {
    try {
      const [paymentsRes, statsRes] = await Promise.all([
        API.get("/admin/payments"),
        API.get("/admin/payments/stats")
      ]);
      setPayments(paymentsRes.data);
      setStats(statsRes.data);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching payments:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <p className="text-white text-lg">Loading payments...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Payment Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-emerald-500 p-5 rounded-2xl shadow-lg text-center">
          <h3 className="text-white/90 text-sm uppercase">Total Revenue</h3>
          <p className="text-2xl font-bold text-white mt-2">
            KES {stats.totalRevenue?.toLocaleString() || 0}
          </p>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-cyan-500 p-5 rounded-2xl shadow-lg text-center">
          <h3 className="text-white/90 text-sm uppercase">Weekly Revenue</h3>
          <p className="text-2xl font-bold text-white mt-2">
            KES {stats.weeklyRevenue?.toLocaleString() || 0}
          </p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-5 rounded-2xl shadow-lg text-center">
          <h3 className="text-white/90 text-sm uppercase">Total Payments</h3>
          <p className="text-2xl font-bold text-white mt-2">
            {stats.totalPayments || 0}
          </p>
        </div>
        <div className="bg-gradient-to-br from-yellow-500 to-orange-500 p-5 rounded-2xl shadow-lg text-center">
          <h3 className="text-white/90 text-sm uppercase">Pending</h3>
          <p className="text-2xl font-bold text-white mt-2">
            {stats.pendingPayments || 0}
          </p>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white/10 rounded-2xl shadow-lg p-6 border border-white/20">
        <h2 className="text-2xl font-semibold text-green-200 mb-4">
          💰 Payment Records
        </h2>
        
        {payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-green-600/50 text-white">
                  <th className="py-3 px-4 text-left">Student</th>
                  <th className="py-3 px-4 text-left">Amount</th>
                  <th className="py-3 px-4 text-left">Phone</th>
                  <th className="py-3 px-4 text-left">Transaction ID</th>
                  <th className="py-3 px-4 text-left">Date</th>
                  <th className="py-3 px-4 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment._id} className="border-b border-white/20 hover:bg-white/10">
                    <td className="py-3 px-4 text-white">
                      {payment.student?.name || "N/A"}
                    </td>
                    <td className="py-3 px-4 text-green-300 font-semibold">
                      KES {payment.amount?.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-gray-200">
                      {payment.phone}
                    </td>
                    <td className="py-3 px-4 text-gray-200 font-mono text-sm">
                      {payment.transactionId}
                    </td>
                    <td className="py-3 px-4 text-gray-200">
                      {new Date(payment.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        payment.status === "success" 
                          ? "bg-green-500 text-white" 
                          : payment.status === "pending"
                          ? "bg-yellow-500 text-black"
                          : "bg-red-500 text-white"
                      }`}>
                        {payment.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-300 text-center py-8">
            No payment records found.
          </p>
        )}
      </div>
    </div>
  );
}