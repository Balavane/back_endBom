const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log("--- DIAGNOSTIC DÉMARRAGE ---");
console.log("📂 Chemin .env visé :", path.join(__dirname, '.env'));
console.log("📧 EMAIL_USER détecté :", process.env.EMAIL_USER ? "OUI (" + process.env.EMAIL_USER + ")" : "NON ❌");
console.log("📧 EMAIL_PASS détecté :", process.env.EMAIL_PASS ? "OUI" : "NON ❌");
console.log("🗄️ DATABASE_URL présent :", process.env.DATABASE_URL ? "OUI" : "NON ❌");
console.log("☁️ CLOUDINARY_CLOUD_NAME :", process.env.CLOUDINARY_CLOUD_NAME ? "OUI (" + process.env.CLOUDINARY_CLOUD_NAME + ")" : "NON ❌");
console.log("☁️ CLOUDINARY_API_KEY :", process.env.CLOUDINARY_API_KEY ? "OUI (" + process.env.CLOUDINARY_API_KEY.substring(0, 4) + "****)" : "NON ❌");
console.log("☁️ CLOUDINARY_API_SECRET :", process.env.CLOUDINARY_API_SECRET ? "OUI (****" + process.env.CLOUDINARY_API_SECRET.substring(process.env.CLOUDINARY_API_SECRET.length - 4) + ")" : "NON ❌");
console.log("----------------------------");

const express = require('express');
// Ajout du module 'https' nécessaire pour l'auto-ping
const https = require('https');
const multer = require('multer');

const cors = require('cors');
const fs = require('fs').promises;
const cloudinary = require('cloudinary').v2;
const { PrismaClient } = require('@prisma/client');
const sharp = require('sharp');
const nodemailer = require('nodemailer');

const app = express();
const prisma = new PrismaClient();

// Test de connexion à la base de données au démarrage
async function testDbConnection() {
    try {
        await prisma.$connect();
        console.log("✅ Connexion à la base de données PostgreSQL réussie.");
    } catch (e) {
        console.error("❌ Échec de la connexion à la base de données :", e.message);
    }
}
testDbConnection();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

// Configuration Cloudinary
cloudinary.config({
    cloud_name: (process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
    api_key: (process.env.CLOUDINARY_API_KEY || "").trim(),
    api_secret: (process.env.CLOUDINARY_API_SECRET || "").trim(),
    secure: true,
    timeout: 120000,
});

// Création du dossier uploads s'il n'existe pas
const createUploadsFolder = async () => {
    try {
        await fs.access(path.join(__dirname, 'uploads'));
    } catch {
        await fs.mkdir(path.join(__dirname, 'uploads'));
    }
};
createUploadsFolder();

// Configuration Multer avec validation
const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/mpeg', 'video/webm', 'video/quicktime'];
const fileFilter = (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Type de fichier non supporté'), false);
    }
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'uploads'));
    },
    filename: (req, file, cb) => {
        const cleanedFileName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        cb(null, `${Date.now()}-${cleanedFileName}`);
    },
});

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Login simple
const authorizedUser = {
    username: 'sergens',
    password: 'Sergens0110',
};

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === authorizedUser.username && password === authorizedUser.password) {
        return res.status(200).json({ message: 'Authentification réussie' });
    }
    return res.status(401).json({ message: 'Nom d\'utilisateur ou mot de passe incorrect' });
});

// Ajouter un article
app.post('/articles', upload.single('articleImage'), async (req, res) => {
    const { articleTitle, articleDescription, articleDetails } = req.body;
    const articleImage = req.file;

    // Validation des entrées
    if (!articleTitle || !articleDescription) {
        return res.status(400).json({ message: 'Le titre et la description sont obligatoires' });
    }

    try {
        let imageUrl = null;
        if (articleImage) {
            try {
                await fs.access(articleImage.path);
            } catch {
                return res.status(400).json({ message: 'Le fichier image est introuvable' });
            }

            const compressedImagePath = path.join(__dirname, 'uploads', `compressed-${articleImage.filename}`);

            // Compression de l'image
            await sharp(articleImage.path)
                .resize(800)
                .jpeg({ quality: 50 })
                .toFile(compressedImagePath);

            // Upload vers Cloudinary
            const result = await cloudinary.uploader.upload(compressedImagePath, {
                timeout: 120000,
            });
            imageUrl = result.secure_url;

            // Nettoyage des fichiers temporaires
            try {
                await fs.unlink(articleImage.path);
                await fs.unlink(compressedImagePath);
            } catch (unlinkError) {
                console.error('Erreur lors de la suppression des fichiers:', unlinkError);
            }
        }

        const newArticle = await prisma.article.create({
            data: {
                title: articleTitle,
                description: articleDescription,
                details: articleDetails,
                imageUrl,
            },
        });

        return res.status(201).json({ message: 'Article créé avec succès', article: newArticle });
    } catch (error) {
        console.error('Erreur lors de la création de l\'article:', error);
        return res.status(500).json({
            message: 'Erreur lors de la création de l\'article',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Récupérer les articles
// Récupérer les articles avec status like pour l'utilisateur
app.get('/articles', async (req, res) => {
    const { userId } = req.query;
    try {
        const articles = await prisma.article.findMany({
            orderBy: { creationDate: 'desc' },
            include: {
                _count: {
                    select: { likes: true, comments: true },
                },
            },
        });

        const articlesWithStatus = await Promise.all(articles.map(async (article) => {
            let isLiked = false;
            if (userId) {
                const like = await prisma.like.findUnique({
                    where: {
                        articleId_userId: {
                            articleId: article.id,
                            userId: userId,
                        },
                    },
                });
                isLiked = !!like;
            }
            return {
                ...article,
                isLiked,
                likesCount: article._count.likes,
                commentsCount: article._count.comments
            };
        }));

        return res.status(200).json({ articles: articlesWithStatus });
    } catch (error) {
        console.error('Erreur lors de la récupération des articles:', error);
        return res.status(500).json({
            message: 'Erreur lors de la récupération des articles',
            error: error.message
        });
    }
});

// Modifier un article
app.put('/articles/:id', upload.single('articleImage'), async (req, res) => {
    const { id } = req.params;
    const { title, description, details } = req.body;
    const articleImage = req.file;

    if (!title || !description) {
        return res.status(400).json({ message: 'Le titre et la description sont obligatoires' });
    }

    try {
        let imageUrl = null;
        if (articleImage) {
            try {
                await fs.access(articleImage.path);
            } catch {
                return res.status(400).json({ message: 'Le fichier image est introuvable' });
            }

            const compressedImagePath = path.join(__dirname, 'uploads', `compressed-${articleImage.filename}`);

            await sharp(articleImage.path)
                .resize(800)
                .jpeg({ quality: 50 })
                .toFile(compressedImagePath);

            const result = await cloudinary.uploader.upload(compressedImagePath, {
                timeout: 120000,
            });
            imageUrl = result.secure_url;

            try {
                await fs.unlink(articleImage.path);
                await fs.unlink(compressedImagePath);
            } catch (unlinkError) {
                console.error('Erreur lors de la suppression des fichiers:', unlinkError);
            }
        }

        const updatedArticle = await prisma.article.update({
            where: { id: parseInt(id) },
            data: {
                title,
                description,
                details,
                ...(imageUrl && { imageUrl }) // Ne met à jour imageUrl que si une nouvelle image est fournie
            },
        });

        return res.status(200).json({ message: 'Article mis à jour avec succès', article: updatedArticle });
    } catch (error) {
        console.error('Erreur lors de la mise à jour de l\'article:', error);
        return res.status(500).json({
            message: 'Erreur lors de la mise à jour de l\'article',
            error: error.message
        });
    }
});

// Supprimer un article
app.delete('/articles/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const deletedArticle = await prisma.article.delete({
            where: { id: parseInt(id) },
        });
        return res.status(200).json({ message: 'Article supprimé avec succès', article: deletedArticle });
    } catch (error) {
        console.error('Erreur lors de la suppression de l\'article:', error);
        return res.status(500).json({
            message: 'Erreur lors de la suppression de l\'article',
            error: error.message
        });
    }
});

// Liker/Unliker un article
app.post('/articles/:id/like', async (req, res) => {
    const articleId = parseInt(req.params.id);
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ message: 'Le champ userId est requis' });
    }

    try {
        // Vérifier si le like existe déjà
        const existingLike = await prisma.like.findUnique({
            where: {
                articleId_userId: {
                    articleId,
                    userId,
                },
            },
        });

        if (existingLike) {
            // Unlike
            await prisma.like.delete({
                where: { id: existingLike.id },
            });
        } else {
            // Like
            await prisma.like.create({
                data: {
                    articleId,
                    userId,
                },
            });
        }

        // Récupérer le nouveau nombre de likes
        const likesCount = await prisma.like.count({
            where: { articleId },
        });

        return res.status(200).json({
            message: existingLike ? 'Like retiré' : 'Article liké',
            likes: likesCount,
            isLiked: !existingLike
        });
    } catch (error) {
        console.error('Erreur lors du like/unlike:', error);
        return res.status(500).json({
            message: 'Erreur serveur lors du like',
            error: error.message
        });
    }
});

// Commentaires avec réponses et likes
app.get('/articles/:id/comments', async (req, res) => {
    const { userId } = req.query;
    try {
        const comments = await prisma.comment.findMany({
            where: {
                articleId: parseInt(req.params.id),
                // parentId: null // Supprimé pour récupérer TOUS les commentaires et les organiser en arbre au front-end
            },
            include: {
                _count: {
                    select: { likes: true, replies: true }
                }
            },
            orderBy: { createdAt: 'asc' }, // On les trie par date pour faciliter la construction de l'arbre
        });

        // Ajouter le statut isLiked pour chaque commentaire
        const commentsWithStatus = await Promise.all(comments.map(async (comment) => {
            let isLiked = false;
            if (userId) {
                const like = await prisma.commentLike.findUnique({
                    where: {
                        commentId_userId: {
                            commentId: comment.id,
                            userId: userId
                        }
                    }
                });
                isLiked = !!like;
            }

            return {
                ...comment,
                likesCount: comment._count.likes,
                repliesCount: comment._count.replies,
                isLiked
            };
        }));

        res.json(commentsWithStatus);
    } catch (error) {
        console.error('Erreur récupération commentaires:', error);
        res.status(500).json({
            message: "Erreur récupération commentaires",
            error: error.message
        });
    }
});

app.post('/articles/:id/comments', async (req, res) => {
    const { userId, content } = req.body;
    const articleId = parseInt(req.params.id);

    if (!content) return res.status(400).json({ message: "Contenu requis" });

    try {
        const comment = await prisma.comment.create({
            data: { articleId, userId: userId || "Anonyme", content },
        });
        res.status(201).json(comment);
    } catch (error) {
        res.status(500).json({ message: "Erreur création commentaire" });
    }
});

// Supprimer un commentaire (Admin)
app.delete('/articles/:articleId/comments/:commentId', async (req, res) => {
    const { articleId, commentId } = req.params;

    try {
        // Vérifier que le commentaire existe et appartient à l'article
        const comment = await prisma.comment.findFirst({
            where: {
                id: parseInt(commentId),
                articleId: parseInt(articleId)
            }
        });

        if (!comment) {
            return res.status(404).json({ message: "Commentaire non trouvé" });
        }

        // Supprimer le commentaire
        await prisma.comment.delete({
            where: { id: parseInt(commentId) }
        });

        return res.status(200).json({ message: "Commentaire supprimé avec succès" });
    } catch (error) {
        console.error('Erreur lors de la suppression du commentaire:', error);
        return res.status(500).json({ message: "Erreur lors de la suppression du commentaire" });
    }
});

// integration d'un systeme de gestion des dons
app.post('/enregistrer-don', async (req, res) => {
    const { nom, postNom, email, telephone, montant, devise } = req.body;

    if (!email || !montant || !devise || !nom || !postNom) {
        return res.status(400).json({ message: 'Tous les champs sont requis.' });
    }

    try {
        const montantF = parseFloat(montant);
        if (isNaN(montantF)) {
            return res.status(400).json({ message: 'Montant invalide.' });
        }

        const newDonation = await prisma.donation.create({
            data: {
                nom,
                postNom,
                email,
                telephone,
                montant: montantF,
                devise,
            },
        });

        console.log(`✅ Don enregistré en base : ${nom} ${postNom} - ${montant} ${devise}`);
        return res.status(201).json({ message: 'Don enregistré avec succès', donation: newDonation });
    } catch (error) {
        console.error('Erreur lors de l’enregistrement du don :', error);
        res.status(500).json({
            message: 'Échec de l’enregistrement du don',
            error: error.message
        });
    }
});

// Répondre à un commentaire
app.post('/articles/:articleId/comments/:commentId/reply', async (req, res) => {
    const { userId, content } = req.body;
    const { articleId, commentId } = req.params;

    if (!content) return res.status(400).json({ message: "Contenu requis" });

    try {
        // Vérifier que le commentaire parent existe
        const parentComment = await prisma.comment.findUnique({
            where: { id: parseInt(commentId) }
        });

        if (!parentComment) {
            return res.status(404).json({ message: "Commentaire parent non trouvé" });
        }

        // Créer la réponse
        const reply = await prisma.comment.create({
            data: {
                articleId: parseInt(articleId),
                userId: userId || "Anonyme",
                content,
                parentId: parseInt(commentId)
            },
            include: {
                _count: {
                    select: { likes: true }
                }
            }
        });

        res.status(201).json({
            ...reply,
            likesCount: reply._count.likes,
            isLiked: false
        });
    } catch (error) {
        console.error('Erreur création réponse:', error);
        res.status(500).json({ message: "Erreur création réponse" });
    }
});

// Liker/Unliker un commentaire
app.post('/comments/:commentId/like', async (req, res) => {
    const commentId = parseInt(req.params.commentId);
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ message: 'Le champ userId est requis' });
    }

    try {
        // Vérifier si le like existe déjà
        const existingLike = await prisma.commentLike.findUnique({
            where: {
                commentId_userId: {
                    commentId,
                    userId,
                },
            },
        });

        if (existingLike) {
            // Unlike
            await prisma.commentLike.delete({
                where: { id: existingLike.id },
            });
        } else {
            // Like
            await prisma.commentLike.create({
                data: {
                    commentId,
                    userId,
                },
            });
        }

        // Récupérer le nouveau nombre de likes
        const likesCount = await prisma.commentLike.count({
            where: { commentId },
        });

        return res.status(200).json({
            message: existingLike ? 'Like retiré' : 'Commentaire liké',
            likes: likesCount,
            isLiked: !existingLike
        });
    } catch (error) {
        console.error('Erreur lors du like/unlike commentaire:', error);
        return res.status(500).json({ message: 'Erreur serveur' });
    }
});

// Récupérer tous les dons (Admin)
app.get('/donations', async (req, res) => {
    try {
        const donations = await prisma.donation.findMany({
            orderBy: { date: 'desc' },
        });
        return res.status(200).json({ donations });
    } catch (error) {
        console.error('Erreur lors de la récupération des dons:', error);
        return res.status(500).json({
            message: 'Erreur lors de la récupération des dons',
            error: error.message
        });
    }
});

// --- GESTION DE LA GALERIE ---

// Récupérer toutes les photos ou vidéos de la galerie
app.get('/gallery', async (req, res) => {
    try {
        const photos = await prisma.gallery.findMany({
            orderBy: { createdAt: 'desc' },
        });
        return res.status(200).json({ photos });
    } catch (error) {
        console.error('Erreur lors de la récupération de la galerie:', error);
        return res.status(500).json({
            message: 'Erreur lors de la récupération de la galerie',
            error: error.message
        });
    }
});

// Ajouter une photo ou vidéo à la galerie
app.post('/gallery', upload.single('photo'), async (req, res) => {
    const file = req.file;

    if (!file) {
        return res.status(400).json({ message: 'Aucun fichier fourni' });
    }

    try {
        const isVideo = file.mimetype.startsWith('video');
        let imageUrl = null;

        if (isVideo) {
            // Upload Vidéo directement vers Cloudinary
            const result = await cloudinary.uploader.upload(file.path, {
                folder: 'gallery_videos',
                resource_type: "video",
                transformation: [
                    { quality: "auto", fetch_format: "auto" }
                ],
                timeout: 300000,
            });
            imageUrl = result.secure_url;
            await fs.unlink(file.path);
        } else {
            // Compression Image avec Sharp
            const compressedImagePath = path.join(__dirname, 'uploads', `gallery-${file.filename}`);
            await sharp(file.path)
                .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 70 })
                .toFile(compressedImagePath);

            const result = await cloudinary.uploader.upload(compressedImagePath, {
                folder: 'gallery_images',
                timeout: 120000,
            });
            imageUrl = result.secure_url;

            await fs.unlink(file.path);
            await fs.unlink(compressedImagePath);
        }

        const newEntry = await prisma.gallery.create({
            data: { 
                url: imageUrl,
                type: isVideo ? 'video' : 'image'
            },
        });

        return res.status(201).json({ 
            message: isVideo ? 'Vidéo ajoutée' : 'Photo ajoutée', 
            photo: newEntry 
        });
    } catch (error) {
        console.error('Erreur lors de l\'ajout à la galerie:', error);
        return res.status(500).json({
            message: 'Erreur lors de l\'ajout à la galerie',
            error: error.message
        });
    }
});

// Supprimer une photo de la galerie
app.delete('/gallery/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.gallery.delete({
            where: { id: parseInt(id) },
        });
        return res.status(200).json({ message: 'Photo supprimée de la galerie' });
    } catch (error) {
        console.error('Erreur lors de la suppression de la photo:', error);
        return res.status(500).json({ message: 'Erreur lors de la suppression' });
    }
});

// Supprimer un don (Optionnel pour l'admin)
app.delete('/donations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.donation.delete({
            where: { id: parseInt(id) },
        });
        return res.status(200).json({ message: 'Don supprimé avec succès' });
    } catch (error) {
        return res.status(500).json({ message: 'Erreur lors de la suppression' });
    }
});

// Middleware de gestion d'erreurs
app.use((err, req, res, next) => {
    console.error(err.stack);
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: 'Erreur de téléchargement de fichier' });
    }
    res.status(500).json({ message: 'Une erreur est survenue' });
});

// Démarrer le serveur
const port = process.env.PORT || 3011;

// --- DÉBUT DU BLOC DE CODE KEEP-ALIVE ---

// URL de votre service Render, utilisée pour s'auto-pinger
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || 'https://back-endbom.onrender.com';
const INTERVAL = 10 * 60 * 1000; // 10 minutes en millisecondes (inférieur à 15 min)

if (RENDER_EXTERNAL_URL && RENDER_EXTERNAL_URL.includes('onrender.com')) {

    // Fonction pour envoyer le "ping"
    const keepAlive = () => {
        https.get(RENDER_EXTERNAL_URL, (res) => {
            if (res.statusCode === 200) {
                console.log(`[Keep-Alive] Ping réussi à ${RENDER_EXTERNAL_URL}. Statut: ${res.statusCode}.`);
            } else {
                console.warn(`[Keep-Alive] Ping réussi, mais statut non 200: ${res.statusCode}.`);
            }
        }).on('error', (err) => {
            console.error(`[Keep-Alive] Erreur lors du ping : ${err.message}`);
        });
    };

    // Démarrer l'intervalle de ping
    setInterval(keepAlive, INTERVAL);
    console.log(`[Keep-Alive] Démarrage de l'auto-ping toutes les ${INTERVAL / 60000} minutes.`);
} else {
    // Ce log n'apparaîtra qu'en local (si RENDER_EXTERNAL_URL n'est pas votre URL Render)
    console.log('[Keep-Alive] Auto-ping non démarré (non déployé sur Render).');
}

// --- FIN DU BLOC DE CODE KEEP-ALIVE ---

app.listen(port, () => {
    console.log(`✅ Serveur backend démarré sur http://localhost:${port}`);
});