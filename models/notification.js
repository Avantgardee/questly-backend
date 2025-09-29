import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema({
    actionByUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    action: {
        type: String,
        enum: ['post', 'comment', 'subscribe','message'],
        required: true,
    },
    actionOnUser: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'User',
        required: true,
    },
    post: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        default: null,  // Необязательный параметр, указывающий на пост
    },
}, {
    timestamps: true,  // Добавляет время создания и обновления записи
});

export default mongoose.model("Notification", NotificationSchema);
