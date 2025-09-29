
import mongoose from "mongoose";

const NoteSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    content: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        default: 'other'
    },
    files: [{
        type: String,
        default: []
    }],
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    searchQuery: String,
    filterCategory: String
}, {
    timestamps: true,
});

export default mongoose.model("Note", NoteSchema);