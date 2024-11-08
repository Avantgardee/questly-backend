import { getPopularTags, create } from '..//postController.js';
import PostModel from '../../models/post.js';
import { sendToRabbitMQ } from '../rabbitmq.js';
import { jest } from '@jest/globals';

// Мокаем модели и функции
jest.mock('../../models/post.js', () => {
    return {
        aggregate: jest.fn(), // Мок для aggregate
        // Создаем метод mockImplementation, чтобы создать экземпляр
        // с методом save, который будет замокан позже.
    };
});
jest.mock('../rabbitmq.js');

describe('Post Controller', () => {
    const mockTags = [{ _id: 'tag1', count: 10 }, { _id: 'tag2', count: 8 }];
    const mockPost = { title: 'Test Post', content: 'Content', _id: 'newPostId' };

    beforeEach(() => {
        jest.clearAllMocks(); // Сброс всех моков перед каждым тестом
    });

    describe('getPopularTags', () => {
        it('should return the most popular tags', async () => {
            // Настройка мока
            PostModel.aggregate.mockResolvedValue(mockTags);
            const req = {};
            const res = {
                json: jest.fn(),
                status: jest.fn().mockReturnThis(),
            };

            await getPopularTags(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockTags);
        });

        it('should return 500 if an error occurs', async () => {
            PostModel.aggregate.mockRejectedValue(new Error('Error fetching tags'));
            const req = {};
            const res = {
                json: jest.fn(),
                status: jest.fn().mockReturnThis(),
            };

            await getPopularTags(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Error fetching tags' });
        });
    });

    describe('create', () => {
        it('should create a new post and send a message to RabbitMQ', async () => {
            // Настройка мока для создания нового экземпляра PostModel
            const mockSave = jest.fn().mockResolvedValue(mockPost);
            PostModel.mockImplementation(() => ({
                save: mockSave,
            }));

            sendToRabbitMQ.mockResolvedValue();

            const req = {
                body: mockPost,
            };
            const res = {
                json: jest.fn(),
                status: jest.fn().mockReturnThis(),
            };

            await create(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(mockPost);
        });

        it('should return 500 if an error occurs during post creation', async () => {
            PostModel.mockImplementation(() => {
                return {
                    save: jest.fn().mockRejectedValue(new Error('Error saving post')),
                };
            });

            const req = {
                body: mockPost,
            };
            const res = {
                json: jest.fn(),
                status: jest.fn().mockReturnThis(),
            };

            await create(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ message: 'Error saving post' });
        });
    });
});
