import NoteModel from "../models/Note.js";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const createNote = async (req, res) => {
    try {
        console.log('Create note request body:', req.body);
        console.log('Create note request headers:', req.headers);

        const { title, content, category, searchQuery, filterCategory } = req.body;
        const userId = req.userId;

        console.log('Extracted data:', { title, content, category, searchQuery, filterCategory, userId });

        if (!title || !content) {
            return res.status(400).json({ message: 'Заголовок и содержание обязательны' });
        }

        const note = new NoteModel({
            title,
            content,
            category: category || 'other',
            user: userId,
            searchQuery: searchQuery || '',
            filterCategory: filterCategory || ''
        });

        const savedNote = await note.save();

        res.json({
            success: true,
            noteId: savedNote._id,
            message: 'Заметка успешно создана'
        });
    } catch (err) {
        console.log('Error creating note:', err);
        res.status(500).json({ message: 'Не удалось создать заметку' });
    }
};

export const uploadNoteFiles = async (req, res) => {
    try {
        const { noteId } = req.body;
        const userId = req.userId;

        if (!noteId) {
            return res.status(400).json({ message: 'ID заметки обязателен' });
        }

        const note = await NoteModel.findOne({ _id: noteId, user: userId });
        if (!note) {
            return res.status(404).json({ message: 'Заметка не найдена' });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'Файлы не были загружены' });
        }

        const fileUrls = [];
        for (const file of req.files) {
            const filePath = `/uploads/notes/${file.filename}`;
            fileUrls.push(filePath);
        }

        note.files = [...note.files, ...fileUrls];
        await note.save();

        res.json({ success: true, message: 'Файлы успешно загружены' });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось загрузить файлы' });
    }
};

export const getUserNotes = async (req, res) => {
    try {
        const userId = req.params.userId;
        const { search, category, sortBy, sortOrder } = req.query;

        let query = { user: userId };

        // Поиск по тексту
        if (search && search.trim() !== '') {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { content: { $regex: search, $options: 'i' } }
            ];
        }

        // Фильтрация по категории
        if (category && category !== 'all' && category !== '') {
            query.category = category;
        }

        // Сортировка
        let sortOptions = {};
        if (sortBy) {
            sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
        } else {
            sortOptions.createdAt = -1;
        }

        const notes = await NoteModel.find(query).sort(sortOptions);

        // Генерация HTML разметки для каждой заметки
        const notesHtml = notes.map(note => `
            <div class="note-card" style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 16px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h3 style="margin-top: 0; color: #333; font-size: 18px; border-bottom: 2px solid #1976d2; padding-bottom: 8px;">${note.title}</h3>
                <p style="color: #666; margin-bottom: 12px; line-height: 1.5; white-space: pre-wrap;">${note.content}</p>
                
                ${note.category ? `
                    <div style="margin-bottom: 12px;">
                        <span style="background: #e3f2fd; padding: 4px 12px; border-radius: 16px; font-size: 12px; color: #1976d2; font-weight: 500;">
                            Категория: ${note.category}
                        </span>
                    </div>
                ` : ''}
                
                ${note.files.length > 0 ? `
                    <div style="margin-top: 12px; padding: 12px; background: #f5f5f5; border-radius: 6px;">
                        <p style="font-size: 14px; color: #666; margin-bottom: 8px; font-weight: 500;">Прикрепленные файлы:</p>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                            ${note.files.map(file => `
                                <a href="http://localhost:4444${file}" target="_blank" 
                                   style="display: inline-flex; align-items: center; 
                                          background: #1976d2; color: white; 
                                          padding: 6px 12px; border-radius: 16px; 
                                          text-decoration: none; font-size: 12px;
                                          transition: background-color 0.2s;">
                                    <span style="margin-right: 4px;">📎</span>
                                    ${file.split('/').pop()}
                                </a>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                <div style="margin-top: 16px; font-size: 12px; color: #999; display: flex; justify-content: space-between; align-items: center;">
                    <span>Создано: ${new Date(note.createdAt).toLocaleDateString('ru-RU')} ${new Date(note.createdAt).toLocaleTimeString('ru-RU')}</span>
                    <button onclick="deleteNote('${note._id}')" 
                            style="background: #f44336; color: white; border: none; 
                                   padding: 4px 8px; border-radius: 4px; cursor: pointer; 
                                   font-size: 11px;">
                        Удалить
                    </button>
                </div>
            </div>
        `).join('');

        const script = `
            <script>
                async function deleteNote(noteId) {
                    if (confirm('Вы уверены, что хотите удалить эту заметку?')) {
                        try {
                            const response = await fetch('/notes/' + noteId, {
                                method: 'DELETE',
                                headers: {
                                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                                }
                            });
                            
                            const result = await response.json();
                            if (result.success) {
                                alert('Заметка удалена');
                                location.reload();
                            } else {
                                alert('Ошибка при удалении: ' + result.message);
                            }
                        } catch (error) {
                            alert('Ошибка при удалении заметки');
                        }
                    }
                }
            </script>
        `;

        res.json({
            success: true,
            notes: notesHtml + script,
            count: notes.length,
            hasResults: notes.length > 0
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось получить заметки' });
    }
};

export const searchNotes = async (req, res) => {
    try {
        const userId = req.userId;
        const { q, category, sortBy, sortOrder, page = 1, limit = 10 } = req.query;

        let query = { user: userId };

        // Поиск по тексту
        if (q && q.trim() !== '') {
            query.$or = [
                { title: { $regex: q, $options: 'i' } },
                { content: { $regex: q, $options: 'i' } }
            ];
        }

        // Фильтрация по категории
        if (category && category !== 'all' && category !== '') {
            query.category = category;
        }

        // Сортировка
        let sortOptions = {};
        if (sortBy) {
            sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
        } else {
            sortOptions.createdAt = -1;
        }

        // Пагинация
        const skip = (page - 1) * limit;
        const notes = await NoteModel.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit));

        const totalCount = await NoteModel.countDocuments(query);
        const totalPages = Math.ceil(totalCount / limit);

        const notesHtml = notes.map(note => `
            <div class="note-card" style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 16px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <h3 style="margin-top: 0; color: #333; font-size: 18px; border-bottom: 2px solid #1976d2; padding-bottom: 8px;">${note.title}</h3>
                <p style="color: #666; margin-bottom: 12px; line-height: 1.5; white-space: pre-wrap;">${note.content}</p>
                
                ${note.category ? `
                    <div style="margin-bottom: 12px;">
                        <span style="background: #e3f2fd; padding: 4px 12px; border-radius: 16px; font-size: 12px; color: #1976d2; font-weight: 500;">
                            Категория: ${note.category}
                        </span>
                    </div>
                ` : ''}
                
                ${note.files.length > 0 ? `
                    <div style="margin-top: 12px; padding: 12px; background: #f5f5f5; border-radius: 6px;">
                        <p style="font-size: 14px; color: #666; margin-bottom: 8px; font-weight: 500;">Прикрепленные файлы:</p>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                            ${note.files.map(file => `
                                <a href="http://localhost:4444${file}" target="_blank" 
                                   style="display: inline-flex; align-items: center; 
                                          background: #1976d2; color: white; 
                                          padding: 6px 12px; border-radius: 16px; 
                                          text-decoration: none; font-size: 12px;
                                          transition: background-color 0.2s;">
                                    <span style="margin-right: 4px;">📎</span>
                                    ${file.split('/').pop()}
                                </a>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                <div style="margin-top: 16px; font-size: 12px; color: #999; display: flex; justify-content: space-between; align-items: center;">
                    <span>Создано: ${new Date(note.createdAt).toLocaleDateString('ru-RU')} ${new Date(note.createdAt).toLocaleTimeString('ru-RU')}</span>
                    <button onclick="deleteNote('${note._id}')" 
                            style="background: #f44336; color: white; border: none; 
                                   padding: 4px 8px; border-radius: 4px; cursor: pointer; 
                                   font-size: 11px;">
                        Удалить
                    </button>
                </div>
            </div>
        `).join('');

        let paginationHtml = '';
        if (totalPages > 1) {
            paginationHtml = `
                <div style="margin-top: 20px; text-align: center;">
                    <div style="display: inline-flex; gap: 8px; align-items: center;">
                        ${Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => `
                            <button onclick="loadPage(${pageNum})" 
                                    style="padding: 6px 12px; border: 1px solid #ddd; 
                                           background: ${pageNum == page ? '#1976d2' : 'white'}; 
                                           color: ${pageNum == page ? 'white' : '#333'}; 
                                           border-radius: 4px; cursor: pointer;">
                                ${pageNum}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        const script = `
            <script>
                async function deleteNote(noteId) {
                    if (confirm('Вы уверены, что хотите удалить эту заметку?')) {
                        try {
                            const response = await fetch('/notes/' + noteId, {
                                method: 'DELETE',
                                headers: {
                                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                                }
                            });
                            
                            const result = await response.json();
                            if (result.success) {
                                alert('Заметка удалена');
                                location.reload();
                            } else {
                                alert('Ошибка при удалении: ' + result.message);
                            }
                        } catch (error) {
                            alert('Ошибка при удалении заметки');
                        }
                    }
                }
                
                function loadPage(page) {
                    const url = new URL(window.location.href);
                    url.searchParams.set('page', page);
                    window.location.href = url.toString();
                }
            </script>
        `;

        res.json({
            success: true,
            notes: notesHtml + paginationHtml + script,
            count: notes.length,
            totalCount,
            totalPages,
            currentPage: parseInt(page),
            hasResults: notes.length > 0
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось выполнить поиск' });
    }
};

export const deleteNote = async (req, res) => {
    try {
        const { noteId } = req.params;
        const userId = req.userId;

        const note = await NoteModel.findOne({ _id: noteId, user: userId });
        if (!note) {
            return res.status(404).json({ message: 'Заметка не найдена' });
        }

        // Удаление файлов заметки
        if (note.files.length > 0) {
            for (const filePath of note.files) {
                const fullPath = path.join(__dirname, '..', '..', filePath);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            }
        }

        await NoteModel.findByIdAndDelete(noteId);

        res.json({ success: true, message: 'Заметка удалена' });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось удалить заметку' });
    }
};