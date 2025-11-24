import mongoose from "mongoose";
const PostSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    text:{
        type: String,
        required: true,
        unique: true,
    },
    tags:{
        type: Array,
        default:[],
    },
    viewsCount:{
        type: Number,
        default: 0
    },
    imageUrl: String,
    user:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    comments:[{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
    }],
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    viewedBy: {
        type: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        }],
        default: [],
    },
}, {
    timestamps: true,

});
export default mongoose.model("Post", PostSchema);