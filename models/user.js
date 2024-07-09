import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    passwordHash: {
        type: String,
        required: true,
    },
    avatarUrl: String,
    subscribers: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'User',
        required: true,
    },
    subscriptions: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'User',
        required: true,
    },
    birthDate: {
        type: Date,
        default: Date.now,
    },
    bio: {
        type: String,
        default: '',
    },
}, {
    timestamps: true,
});

export default mongoose.model("User", UserSchema);