import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import MessageModel from '../models/Message.js';
import ChatModel from '../models/Chat.js';
import UserModel from "../models/user.js";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

mongoose.connect("mongodb+srv://admin:wwwwww@cluster0.0qdhldu.mongodb.net/blog?retryWrites=true&w=majority&appName=Cluster0")
    .then(() => console.log("WebSocket Gateway: Database Connected"))
    .catch((err) => console.log('WebSocket Gateway: DB error', err));

const connectedUsers = new Map();

wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection');

    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
        console.log('No token provided');
        ws.close(1008, 'No token provided');
        return;
    }

    try {
        const decoded = jwt.verify(token, 'secret123');
        const userId = decoded._id;

        connectedUsers.set(userId, ws);
        console.log(`User ${userId} connected`);

        sendPendingDeliveryStatuses(userId);

        ws.on('message', async (message) => {
            try {
                const parsedMessage = JSON.parse(message);
                await handleMessage(userId, parsedMessage);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        });

        ws.on('close', () => {
            connectedUsers.delete(userId);
            console.log(`User ${userId} disconnected`);
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
            connectedUsers.delete(userId);
        });

    } catch (error) {
        console.error('Invalid token:', error);
        ws.close(1008, 'Invalid token');
    }
});

async function sendPendingDeliveryStatuses(userId) {
    try {
        const undeliveredMessages = await MessageModel.find({
            deliveredTo: { $ne: userId },
            chat: { $in: await getUsersChats(userId) },
            sender: { $ne: userId }
        }).populate('sender', 'fullName avatarUrl').populate('chat');

        for (const message of undeliveredMessages) {
            const senderWs = connectedUsers.get(message.sender._id.toString());
            if (senderWs && senderWs.readyState === 1) {
                senderWs.send(JSON.stringify({
                    type: 'MESSAGE_DELIVERED',
                    data: {
                        messageId: message._id,
                        recipientId: userId,
                        chatId: message.chat._id
                    }
                }));
            }

            await MessageModel.findByIdAndUpdate(message._id, {
                $addToSet: { deliveredTo: userId },
                status: 'delivered'
            });
        }
    } catch (error) {
        console.error('Error sending pending delivery statuses:', error);
    }
}

async function getUsersChats(userId) {
    const chats = await ChatModel.find({ participants: userId });
    return chats.map(chat => chat._id);
}

async function handleMessage(senderId, message) {
    console.log('Received message:', message.type, 'from:', senderId);

    switch (message.type) {
        case 'SEND_MESSAGE':
            await handleSendMessage(senderId, message);
            break;
        case 'DELETE_MESSAGE':
            await handleDeleteMessage(senderId, message);
            break;
        case 'EDIT_MESSAGE':
            await handleEditMessage(senderId, message);
            break;
        case 'TYPING':
            await handleTyping(senderId, message);
            break;
        case 'READ_MESSAGE':
            await handleReadMessage(senderId, message);
            break;
        case 'MARK_CHAT_AS_READ':
            await handleMarkChatAsRead(senderId, message);
            break;
        case 'MESSAGE_DELIVERED':
            await handleMessageDelivered(senderId, message);
            break;
        default:
            console.log('Unknown message type:', message.type);
    }
}

async function handleDeleteMessage(senderId, message) {
    try {
        const { messageId } = message.data;
        console.log('Deleting message:', messageId, 'by user:', senderId);

        const messageDoc = await MessageModel.findById(messageId)
            .populate('chat', 'participants');

        if (!messageDoc) {
            console.log('Message not found:', messageId);
            return;
        }

        const isSender = messageDoc.sender.toString() === senderId;
        const isParticipant = messageDoc.chat.participants.some(p => p.toString() === senderId);

        if (!isSender && !isParticipant) {
            console.log('User', senderId, 'has no rights to delete message');
            return;
        }

        if (messageDoc.attachments && messageDoc.attachments.length > 0) {
            messageDoc.attachments.forEach(filePath => {
                const fullPath = path.join(__dirname, '..', filePath);
                if (fs.existsSync(fullPath)) {
                    try {
                        fs.unlinkSync(fullPath);
                        console.log('Deleted file:', filePath);
                    } catch (fileError) {
                        console.error('Error deleting file:', fileError);
                    }
                }
            });
        }

        await MessageModel.findByIdAndDelete(messageId);
        console.log('Message deleted from DB:', messageId);

        const chat = await ChatModel.findById(messageDoc.chat._id);
        if (chat.lastMessage && chat.lastMessage.toString() === messageId) {
            const lastMessage = await MessageModel.findOne(
                { chat: messageDoc.chat._id },
                {},
                { sort: { createdAt: -1 } }
            );

            chat.lastMessage = lastMessage ? lastMessage._id : null;
            await chat.save();
            console.log('Updated last message for chat:', chat._id);
        }

        for (const participantId of messageDoc.chat.participants) {
            const participantStr = participantId.toString();
            const ws = connectedUsers.get(participantStr);
            if (ws && ws.readyState === 1) {
                ws.send(JSON.stringify({
                    type: 'MESSAGE_DELETED',
                    data: { messageId, chatId: messageDoc.chat._id }
                }));
                console.log('Notified user about deletion:', participantStr);
            }
        }

    } catch (error) {
        console.error('Error handling delete message:', error);
    }
}

async function handleEditMessage(senderId, message) {
    try {
        const { messageId, text } = message.data;
        console.log('Editing message:', messageId, 'by user:', senderId);

        const messageDoc = await MessageModel.findById(messageId);

        if (!messageDoc) {
            console.log('Message not found:', messageId);
            return;
        }

        if (messageDoc.sender.toString() !== senderId) {
            console.log('User is not sender of the message');
            return;
        }

        const messageAge = Date.now() - new Date(messageDoc.createdAt).getTime();
        const fifteenMinutes = 15 * 60 * 1000;

        if (messageAge > fifteenMinutes) {
            console.log('Message is too old to edit');
            return;
        }

        messageDoc.text = text;
        messageDoc.edited = true;
        messageDoc.editedAt = new Date();
        await messageDoc.save();

        await messageDoc.populate('sender', 'fullName avatarUrl');
        console.log('Message edited:', messageId);

        const chat = await ChatModel.findById(messageDoc.chat);
        for (const participantId of chat.participants) {
            const participantStr = participantId.toString();
            const ws = connectedUsers.get(participantStr);
            if (ws && ws.readyState === 1) {
                ws.send(JSON.stringify({
                    type: 'MESSAGE_EDITED',
                    data: messageDoc
                }));
            }
        }

    } catch (error) {
        console.error('Error handling edit message:', error);
    }
}

async function handleSendMessage(senderId, message) {
    try {
        const { chatId, text, attachments } = message.data;
        console.log('Sending message to chat:', chatId, 'by user:', senderId);

        const chat = await ChatModel.findOne({
            _id: chatId,
            participants: senderId
        });

        if (!chat) {
            console.log('Access denied for chat:', chatId);
            return;
        }

        const newMessage = new MessageModel({
            chat: chatId,
            sender: senderId,
            text,
            attachments,
            status: 'sent'
        });

        await newMessage.save();
        await newMessage.populate('sender', 'fullName avatarUrl');
        console.log('Message saved to DB:', newMessage._id);

        chat.lastMessage = newMessage._id;
        chat.updatedAt = new Date();

        chat.participants.forEach(participantId => {
            if (participantId.toString() !== senderId) {
                const currentCount = chat.unreadCount.get(participantId.toString()) || 0;
                chat.unreadCount.set(participantId.toString(), currentCount + 1);
            }
        });
        chat.markModified('unreadCount');
        await chat.save();

        const participants = chat.participants.map(p => p.toString());

        for (const participantId of participants) {
            const ws = connectedUsers.get(participantId);
            if (ws && ws.readyState === 1) {
                ws.send(JSON.stringify({
                    type: 'NEW_MESSAGE',
                    data: {
                        message: newMessage,
                        chat: chat,
                    }
                }));
                console.log('Message sent to user:', participantId);

                if (participantId !== senderId) {
                    const senderWs = connectedUsers.get(senderId);
                    if (senderWs && senderWs.readyState === 1) {
                        senderWs.send(JSON.stringify({
                            type: 'MESSAGE_DELIVERED',
                            data: {
                                messageId: newMessage._id,
                                recipientId: participantId,
                                chatId: chatId
                            }
                        }));
                    }

                    await MessageModel.findByIdAndUpdate(newMessage._id, {
                        $addToSet: { deliveredTo: participantId },
                        status: 'delivered'
                    });
                }
            }
        }

        const senderWs = connectedUsers.get(senderId);
        if (senderWs && senderWs.readyState === 1) {
            senderWs.send(JSON.stringify({
                type: 'MESSAGE_SENT',
                data: { messageId: newMessage._id }
            }));
        }

    } catch (error) {
        console.error('Error handling message:', error);
    }
}

async function handleTyping(senderId, message) {
    try {
        const { chatId, isTyping } = message.data;
        console.log('Typing indicator:', isTyping, 'in chat:', chatId, 'by user:', senderId);

        const chat = await ChatModel.findById(chatId);
        if (!chat) return;

        for (const participantId of chat.participants) {
            const participantStr = participantId.toString();
            if (participantStr !== senderId) {
                const ws = connectedUsers.get(participantStr);
                if (ws && ws.readyState === 1) {
                    ws.send(JSON.stringify({
                        type: 'TYPING_INDICATOR',
                        data: { chatId, userId: senderId, isTyping }
                    }));
                }
            }
        }

    } catch (error) {
        console.error('Error handling typing:', error);
    }
}

async function handleMessageDelivered(senderId, message) {
    try {
        const { messageId } = message.data;
        console.log('Message delivered confirmation:', messageId, 'by user:', senderId);

        await MessageModel.findByIdAndUpdate(messageId, {
            $addToSet: { deliveredTo: senderId },
            status: 'delivered'
        });

        const messageDoc = await MessageModel.findById(messageId).populate('sender');
        if (messageDoc && messageDoc.sender._id.toString() !== senderId) {
            const senderWs = connectedUsers.get(messageDoc.sender._id.toString());
            if (senderWs && senderWs.readyState === 1) {
                senderWs.send(JSON.stringify({
                    type: 'MESSAGE_DELIVERED',
                    data: {
                        messageId,
                        recipientId: senderId,
                        chatId: messageDoc.chat
                    }
                }));
            }
        }

    } catch (error) {
        console.error('Error handling message delivered:', error);
    }
}

async function handleReadMessage(senderId, message) {
    try {
        const { messageId } = message.data;
        console.log('Marking message as read:', messageId, 'by user:', senderId);

        const messageDoc = await MessageModel.findById(messageId).populate('sender');

        if (!messageDoc) {
            console.log(`Message with id ${messageId} not found`);
            return;
        }

        await MessageModel.findByIdAndUpdate(messageId, {
            $addToSet: { readBy: senderId },
            status: 'read'
        }, { new: true });

        if (messageDoc && messageDoc.sender._id.toString() !== senderId) {
            const senderWs = connectedUsers.get(messageDoc.sender._id.toString());
            if (senderWs && senderWs.readyState === 1) {
                senderWs.send(JSON.stringify({
                    type: 'MESSAGE_READ',
                    data: {
                        messageId,
                        readerId: senderId,
                        chatId: messageDoc.chat
                    }
                }));
                console.log('Notified sender about read message:', messageDoc.sender._id);
            }
        }

    } catch (error) {
        console.error('Error handling read message:', error);
    }
}

async function handleMarkChatAsRead(senderId, message) {
    try {
        const { chatId } = message.data;
        console.log(`Marking chat ${chatId} as read for user ${senderId}`);
        const chat = await ChatModel.findById(chatId);
        if (!chat) {
            console.log(`Chat with id ${chatId} not found`);
            return;
        }

        chat.unreadCount.set(senderId, 0);
        chat.markModified('unreadCount');
        await chat.save();

        console.log(`Unread count for user ${senderId} in chat ${chatId} reset to 0`);

        const ws = connectedUsers.get(senderId);
        if(ws && ws.readyState === 1) {
            ws.send(JSON.stringify({
                type: 'CHAT_MARKED_AS_READ',
                data: {
                    chatId,
                    userId: senderId
                }
            }));
        }

    } catch (error) {
        console.error('Error handling mark chat as read:', error);
    }
}

function sendNotificationToUser(userId, notification) {
    const userWs = connectedUsers.get(userId);
    if (userWs && userWs.readyState === 1) {
        userWs.send(JSON.stringify({
            type: 'NOTIFICATION',
            data: notification
        }));
    }
}

process.on('SIGINT', () => {
    console.log('Shutting down WebSocket server...');
    wss.close(() => {
        console.log('WebSocket server closed');
        process.exit(0);
    });
});

server.listen(8080, () => {
    console.log('WebSocket gateway running on port 8080');
});