import { useState } from "react";
import API from "../api/axios";
import { motion } from "framer-motion";

export default function SubscriptionPage() {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedSubjects, setSelectedSubjects] = useState([]);

  // Fixed subject frequencies as per requirements
  const fixedSubjects = [
    { name: "Mathematics", frequency: 5 },
    { name: "Chemistry", frequency: 4 },
    { name: "English", frequency: 4 },
    { name: "Kiswahili", frequency: 3 },
    { name: "Biology", frequency: 3 },
    { name: "Business", frequency: 3 },
    { name: "Agriculture", frequency: 3 },
    { name: "CRE", frequency: 3 },
    { name: "Physics", frequency: 2 },
    // ADD THESE TWO NEW SUBJECTS:
    { name: "Geography", frequency: 3 },
    { name: "History", frequency: 3 },
  ];

  // 💰 Calculate total cost based on selected subjects
  const calculateAmount = () => {
    let total = 0;
    selectedSubjects.forEach(subjectName => {
      const subject = fixedSubjects.find(s => s.name === subjectName);
      if (subject) {
        total += subject.frequency * 40; // KSH 40 per lesson
      }
    });
    return total;
  };

  // Calculate total lessons per week
  const calculateTotalLessons = () => {
    return selectedSubjects.reduce((total, subjectName) => {
      const subject = fixedSubjects.find(s => s.name === subjectName);
      return total + (subject ? subject.frequency : 0);
    }, 0);
  };

  const handleSubjectToggle = (subjectName) => {
    setSelectedSubjects(prev => {
      if (prev.includes(subjectName)) {
        return prev.filter(sub => sub !== subjectName);
      } else {
        return [...prev, subjectName];
      }
    });
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    if (selectedSubjects.length === 0) {
      setMessage("⚠️ Please select at least one subject.");
      setLoading(false);
      return;
    }

    // Prepare subjects with their fixed frequencies
    const subjectsWithFixedFreq = selectedSubjects.map(subjectName => {
      const subject = fixedSubjects.find(s => s.name === subjectName);
      return {
        subject: subjectName,
        frequency: subject.frequency
      };
    });

    try {
      const res = await API.post("/mpesa/stkpush", {
        phone: phone.startsWith("254") ? phone : "254" + phone.replace(/^0+/, ""),
        subjects: subjectsWithFixedFreq,
      });

      setMessage(res.data.message || "✅ Payment request sent to your phone!");
    } catch (err) {
      setMessage(err.response?.data?.message || "❌ Payment failed, try again.");
    }

    setLoading(false);
  };

  const totalLessonsPerWeek = calculateTotalLessons();
  const totalAmount = calculateAmount();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-800 to-pink-700 text-white px-4 py-10">
      <motion.div
        className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-8 w-full max-w-md"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <motion.h2
          className="text-3xl font-extrabold text-center mb-6 drop-shadow-lg text-yellow-300"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          💳 Weekly Subscription
        </motion.h2>

        <form onSubmit={handlePayment} className="space-y-5">
          {/* Subjects Selection */}
          <div>
            <label className="block mb-3 text-sm font-semibold text-pink-200">
              Select Subjects (Fixed Weekly Frequency)
            </label>
            <div className="space-y-3 max-h-96 overflow-y-auto p-3 bg-white/10 rounded-lg border border-white/20">
              {fixedSubjects.map((subject) => (
                <div key={subject.name} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={selectedSubjects.includes(subject.name)}
                      onChange={() => handleSubjectToggle(subject.name)}
                      className="h-5 w-5 text-green-500 rounded focus:ring-green-400"
                    />
                    <span className="text-white text-sm">{subject.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm text-yellow-300">{subject.frequency}×/week</span>
                    <div className="text-xs text-gray-300">
                      KES {subject.frequency * 40}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-300 mt-2">
              Total lessons per week: {totalLessonsPerWeek}
            </p>
          </div>

          {/* Phone Number */}
          <div>
            <label className="block mb-2 text-sm font-semibold text-pink-200">
              M-Pesa Phone Number
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0712345678"
              required
              className="w-full p-3 rounded-lg bg-white/20 text-white placeholder-gray-300 focus:ring-2 focus:ring-yellow-400 outline-none"
            />
          </div>

          {/* Total Display */}
          <motion.div
            className="text-center bg-gradient-to-r from-green-500 to-blue-500 py-3 rounded-xl text-lg font-bold shadow-md"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
          >
            Weekly Total: KES {totalAmount.toLocaleString()}
          </motion.div>

          {/* Selected Subjects Summary */}
          {selectedSubjects.length > 0 && (
            <motion.div 
              className="bg-white/10 p-3 rounded-lg border border-white/20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <h4 className="text-sm font-semibold text-pink-200 mb-2">Selected Subjects:</h4>
              <div className="text-xs space-y-1">
                {selectedSubjects.map(subjectName => {
                  const subject = fixedSubjects.find(s => s.name === subjectName);
                  return (
                    <div key={subjectName} className="flex justify-between">
                      <span>{subjectName}</span>
                      <span>{subject.frequency} lessons (KES {subject.frequency * 40})</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Pay Button */}
          <motion.button
            type="submit"
            disabled={loading || selectedSubjects.length === 0}
            whileHover={{ scale: selectedSubjects.length > 0 ? 1.05 : 1 }}
            whileTap={{ scale: selectedSubjects.length > 0 ? 0.95 : 1 }}
            className={`w-full py-3 rounded-xl font-bold shadow-lg transition-all ${
              selectedSubjects.length > 0 
                ? "bg-gradient-to-r from-green-600 to-teal-600 hover:shadow-green-500/40 text-white"
                : "bg-gray-600 text-gray-300 cursor-not-allowed"
            }`}
          >
            {loading ? "Processing..." : "Pay Weekly with M-Pesa"}
          </motion.button>
        </form>

        {message && (
          <motion.p
            className={`text-center text-sm mt-4 ${
              message.includes("✅") ? "text-green-300" : "text-red-300"
            }`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {message}
          </motion.p>
        )}
      </motion.div>
    </div>
  );
}