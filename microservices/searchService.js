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
  type Post {
    _id: ID!
    title: String!
    text: String!
  }

  type Comment {
    _id: ID!
    text: String!
  }

  type User {
    _id: ID!
    fullName: String!
    email: String!
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

            const posts = await Post.find({ $or: [{ title: regex }, { text: regex }] });
            const comments = await Comment.find({ text: regex });
            const users = await User.find({ $or: [{ fullName: regex }, { email: regex }] });
            const messages = await Message.find({ text: regex });

            return {
                posts,
                comments,
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

const yoga = createYoga({ schema });
app.use('/graphql', yoga);

const server = createServer(app);

server.listen(5005, () => {
    console.log('Search service with GraphQL is running on http://localhost:5005/graphql');
});