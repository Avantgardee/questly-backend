import express from 'express';
import { createServer } from 'http';
import { createYoga } from 'graphql-yoga';
import { makeExecutableSchema } from '@graphql-tools/schema';
import mongoose from 'mongoose';
import cors from 'cors';

import Post from "../models/post.js";
import User from "../models/user.js";
import Message from "../models/Message.js";
import Comment from "../models/comment.js";
mongoose.connect("mongodb+srv://admin:wwwwww@cluster0.0qdhldu.mongodb.net/blog?retryWrites=true&w=majority&appName=Cluster0")
    .then(() => console.log("Search Service: Database Connected Successfully"))
    .catch((err) => console.log('Search Service DB error', err));

const typeDefs = `
  type User {
    _id: ID!
    fullName: String!
    email: String!
    avatarUrl: String
  }

  type Post {
    _id: ID!
    title: String!
    text: String!
    user: User
  }

  type Comment {
    _id: ID!
    text: String!
    user: User
    postId: ID
    postUrl: String
    createdAt: String
  }

  type Message {
    _id: ID!
    text: String!
    chat: ID! 
  }

  type SearchResult {
    posts: [Post]
    comments: [Comment]
    users: [User]
    messages: [Message]
  }

  type Query {
    search(term: String!): SearchResult
  }
`;

const resolvers = {
    Query: {
        search: async (_, { term }) => {
            const regex = new RegExp(term, 'i');

            const posts = await Post.find({ $or: [{ title: regex }, { text: regex }] })
                .populate({
                    path: 'user',
                    select: 'fullName email avatarUrl',
                    model: 'User'
                })
                .lean();
            // First find all matching comments
            const comments = await Comment.find({ text: regex })
                .populate({
                    path: 'user',
                    select: 'fullName email avatarUrl',
                    model: 'User'
                })
                .sort({ createdAt: -1 })
                .lean();

            // Find the post that contains each comment
            const commentsWithPostInfo = await Promise.all(comments.map(async (comment) => {
                // Find the post that includes this comment in its comments array
                const post = await Post.findOne({ comments: { $in: [comment._id] } });
                
                // If no post found, try alternative method (in case the comment reference is not properly set)
                let foundPost = post;
                if (!foundPost) {
                    foundPost = await Post.findOne({ 'comments': comment._id });
                }
                
                return {
                    ...comment,
                    postId: foundPost?._id ? foundPost._id.toString() : null,
                    postUrl: foundPost?._id ? `/posts/${foundPost._id}` : null
                };
            }));
            
            const users = await User.find({ $or: [{ fullName: regex }, { email: regex }] });
            const messages = await Message.find({ text: regex });

            return {
                posts,
                comments: commentsWithPostInfo,
                users,
                messages,
            };
        },
    },
};

const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
});

const app = express();
app.use(cors());
app.use(express.json());

// Create a Yoga instance with the schema and GraphiQL options
const yoga = createYoga({
    schema,
    graphiql: true, // Enable GraphiQL for testing
    context: (req) => ({
        req,
    }),
});

// Use the Yoga server as middleware
app.use('/graphql', (req, res, next) => {
    return yoga.handle(req, res)
        .catch(error => {
            console.error('GraphQL Error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

const server = createServer(app);

// Handle server errors
server.on('error', (error) => {
    console.error('Server error:', error);
});

server.listen(5005, '0.0.0.0', () => {
    console.log('Search service with GraphQL is running on http://localhost:5005/graphql');
    console.log('GraphiQL available at http://localhost:5005/graphql');
});