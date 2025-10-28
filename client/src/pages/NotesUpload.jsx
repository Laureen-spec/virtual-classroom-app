import { useState } from "react";
import API from "../api/axios";

export default function NotesUpload() {
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState("");

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return setMsg("Please select a file.");

    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    form.append("subject", subject);

    try {
      const res = await API.post("/materials/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMsg("✅ Notes uploaded successfully!");
      setFile(null);
      setTitle("");
      setSubject("");
    } catch (err) {
      setMsg(err.response?.data?.message || "Upload failed.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-indigo-700 text-white p-6">
      <form
        onSubmit={handleUpload}
        className="bg-white/10 p-8 rounded-2xl shadow-lg w-full max-w-md border border-white/20"
      >
        <h2 className="text-2xl font-bold mb-6 text-center">📘 Upload Notes</h2>
        <input
          type="text"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          className="w-full p-2 mb-3 bg-white/20 rounded"
        />
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full p-2 mb-3 bg-white/20 rounded"
        />
        <input
          type="file"
          onChange={(e) => setFile(e.target.files[0])}
          className="w-full mb-4"
        />
        <button className="w-full bg-purple-500 py-2 rounded hover:bg-purple-600">
          Upload
        </button>
        {msg && <p className="text-center mt-3 text-sm">{msg}</p>}
      </form>
    </div>
  );
}
