import { useEffect, useState } from "react";
import API from "../api/axios";

export default function NotesList() {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    const fetchNotes = async () => {
      const res = await API.get("/materials");
      setNotes(res.data);
    };
    fetchNotes();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-500 to-blue-600 text-white p-6">
      <div className="max-w-3xl mx-auto bg-white/10 p-6 rounded-2xl shadow-lg border border-white/20">
        <h2 className="text-3xl font-bold mb-6 text-center">📘 Available Notes</h2>
        {notes.length ? (
          <ul className="space-y-4">
            {notes.map((note) => (
              <li
                key={note._id}
                className="bg-white/20 p-4 rounded-lg flex justify-between items-center"
              >
                <div>
                  <p className="font-semibold text-lg">{note.title}</p>
                  <p className="text-sm">{note.subject}</p>
                </div>
                <a
                  href={note.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg"
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>No notes uploaded yet.</p>
        )}
      </div>
    </div>
  );
}
