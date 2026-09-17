const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static('public'));
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 1. MongoDB Connection Setup
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.log('Database Connection Error:', err));

// 2. Mongoose Schemas & Models (Saara data ab MongoDB mein save hoga)
const userSchema = new mongoose.Schema({
    mobile: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    balance: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

const challengeSchema = new mongoose.Schema({
    id: Number,
    creator: String,
    amount: Number,
    description: String,
    status: { type: String, default: 'Open' },
    joinedBy: { type: String, default: null },
    roomCode: { type: String, default: null },
    winner: { type: String, default: null },
    winAmount: { type: Number, default: 0 },
    screenshot: { type: String, default: null },
    chats: [{ sender: String, message: String, time: String }]
});
const Challenge = mongoose.model('Challenge', challengeSchema);

const depositSchema = new mongoose.Schema({
    id: Number,
    username: String,
    amount: Number,
    screenshot: String,
    status: { type: String, default: 'Pending' },
    date: String
});
const Deposit = mongoose.model('Deposit', depositSchema);

const withdrawalSchema = new mongoose.Schema({
    id: Number,
    username: String,
    amount: Number,
    method: String,
    upiId: String,
    mobileNumber: String,
    appChoice: String,
    qrScreenshot: String,
    status: { type: String, default: 'Pending' },
    date: String
});
const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);

const resultSchema = new mongoose.Schema({
    id: Number,
    username: String,
    roomCode: String,
    screenshot: String,
    status: { type: String, default: 'Pending Approval' }
});
const Result = mongoose.model('Result', resultSchema);

const settingSchema = new mongoose.Schema({
    key: String,
    value: mongoose.Schema.Types.Mixed
});
const Setting = mongoose.model('Setting', settingSchema);

const playerSchema = new mongoose.Schema({
    mobile: String,
    name: String,
    amount: Number
});
const Player = mongoose.model('Player', playerSchema);

const adminSessionSchema = new mongoose.Schema({
    deviceName: String,
    loginTime: String,
    ip: String
});
const AdminSession = mongoose.model('AdminSession', adminSessionSchema);

// Helper function to initialize default settings if not exists
async function getOrCreateSettings() {
    let adminPass = await Setting.findOne({ key: 'adminPassword' });
    if (!adminPass) {
        adminPass = new Setting({ key: 'adminPassword', value: 'Jaipur@!78499' });
        await adminPass.save();
    }
    let comm = await Setting.findOne({ key: 'dailyCommission' });
    if (!comm) {
        comm = new Setting({ key: 'dailyCommission', value: 0 });
        await comm.save();
    }
    let qr = await Setting.findOne({ key: 'qrCodes' });
    if (!qr) {
        qr = new Setting({ key: 'qrCodes', value: [
            { id: 1, name: 'PhonePe / AU Small Finance Bank', upiId: 'jpsmall@ybl', qrImage: 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=jpsmall@ybl' },
            { id: 2, name: 'Google Pay (GPay)', upiId: '9216290422@okbizaxis', qrImage: 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=9216290422@okbizaxis' }
        ]});
        await qr.save();
    }
}
getOrCreateSettings();

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

function isValidPassword(password) {
    if (!password || password.length < 8 || password.length > 12) return false;
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    return hasLower && hasUpper && hasDigit && hasSpecial;
}

// 3. API Routes (MongoDB Integrated)

app.post('/api/user/auth', async (req, res) => {
    try {
        const { mobile, password, name } = req.body;
        let user = await User.findOne({ mobile });

        if (user) {
            if (user.password === password) {
                res.json({ success: true, message: 'Login safal raha!', username: user.mobile, name: user.name });
            } else {
                res.json({ success: false, message: 'Galat password! Kripya dobara koshish karein.' });
            }
        } else {
            if (!name) {
                res.json({ success: false, message: 'Yeh mobile number registered nahi hai. Sign In karne ke liye Naam bharna zaroori hai!' });
                return;
            }
            if (!isValidPassword(password)) {
                res.json({ success: false, message: 'Password 8 se 12 characters ka hona chahiye aur usme Uppercase, Lowercase, Number aur Special Character zaroor hone chahiye!' });
                return;
            }
            user = new User({ mobile, password, name, balance: 0 });
            await user.save();
            res.json({ success: true, message: 'Account safalpurvak ban gaya aur login ho gaya!', username: mobile, name: name });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

app.get('/api/user/:mobile', async (req, res) => {
    try {
        const user = await User.findOne({ mobile: req.params.mobile });
        if (user) {
            res.json({ balance: user.balance, name: user.name });
        } else {
            res.json({ balance: 0, name: '' });
        }
    } catch (err) {
        res.status(500).json({ balance: 0, name: '' });
    }
});

app.post('/api/user/update-password', async (req, res) => {
    try {
        const { mobile, oldPassword, newPassword } = req.body;
        const user = await User.findOne({ mobile });

        if (!user) {
            return res.json({ success: false, message: 'User nahi mila!' });
        }
        if (user.password !== oldPassword) {
            return res.json({ success: false, message: 'Purana password galat hai!' });
        }
        if (!isValidPassword(newPassword)) {
            return res.json({ success: false, message: 'Naya password 8-12 characters ka hona chahiye aur usme Uppercase, Lowercase, Number aur Special Character hona anivarya hai!' });
        }

        user.password = newPassword;
        await user.save();
        res.json({ success: true, message: 'Password safalpurvak update ho gaya!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

app.post('/api/challenge/create', async (req, res) => {
    try {
        const { username, amount, description } = req.body;
        const user = await User.findOne({ mobile: username });
        const amt = parseFloat(amount);

        if (!user || user.balance < amt) {
            return res.json({ success: false, message: 'Aapke wallet mein paryapt balance nahi hai!' });
        }

        user.balance -= amt;
        await user.save();

        let pItem = await Player.findOne({ mobile: username });
        if (pItem) {
            pItem.amount = user.balance;
            await pItem.save();
        }

        const newChallenge = new Challenge({
            id: Date.now(),
            creator: username,
            amount: amt,
            description: description || 'No description',
            status: 'Open',
            joinedBy: null,
            roomCode: null,
            winner: null,
            winAmount: 0,
            screenshot: null,
            chats: []
        });

        await newChallenge.save();
        res.json({ success: true, message: 'Challenge safalpurvak live kar diya gaya hai!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

app.post('/api/challenge/join', async (req, res) => {
    try {
        const { challengeId, username } = req.body;
        const challenge = await Challenge.findOne({ id: Number(challengeId) });

        if (!challenge || challenge.status !== 'Open') {
            return res.json({ success: false, message: 'Yeh challenge ab available nahi hai!' });
        }
        if (challenge.creator === username) {
            return res.json({ success: false, message: 'Aap apne hi challenge ko join nahi kar sakte!' });
        }

        const user = await User.findOne({ mobile: username });
        if (!user || user.balance < challenge.amount) {
            return res.json({ success: false, message: 'Aapke wallet mein join karne ke liye balance nahi hai!' });
        }

        user.balance -= challenge.amount;
        await user.save();

        let pItem = await Player.findOne({ mobile: username });
        if (pItem) {
            pItem.amount = user.balance;
            await pItem.save();
        }

        challenge.joinedBy = username;
        challenge.status = 'Running';
        await challenge.save();

        res.json({ success: true, message: 'Aapne challenge safalpurvak join kar liya hai!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

app.post('/api/challenge/roomcode', async (req, res) => {
    try {
        const { challengeId, roomCode, username } = req.body;
        const challenge = await Challenge.findOne({ id: Number(challengeId) });

        if (!challenge) {
            return res.json({ success: false, message: 'Challenge nahi mila!' });
        }
        if (challenge.creator !== username) {
            return res.json({ success: false, message: 'Sirf creator hi room code bhej sakta hai!' });
        }
        if (!roomCode || roomCode.length !== 8 || !/^\d+$/.test(roomCode)) {
            return res.json({ success: false, message: 'Room code thik 8 digits ka numeric hona anivarya hai!' });
        }

        challenge.roomCode = roomCode;
        challenge.status = 'Playing';
        await challenge.save();

        res.json({ success: true, message: 'Room code safalpurvak bhej diya gaya hai!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

app.post('/api/challenge/chat', async (req, res) => {
    try {
        const { challengeId, sender, message } = req.body;
        const challenge = await Challenge.findOne({ id: Number(challengeId) });
        if (!challenge) {
            return res.json({ success: false, message: 'Challenge nahi mila!' });
        }

        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        challenge.chats.push({ sender, message, time: timeStr });
        await challenge.save();

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/deposit', upload.single('screenshot'), async (req, res) => {
    try {
        const { username, amount } = req.body;
        const screenshot = req.file ? `/uploads/${req.file.filename}` : '';

        const newDeposit = new Deposit({
            id: Date.now(),
            username,
            amount: parseFloat(amount),
            screenshot,
            status: 'Pending',
            date: new Date().toLocaleString()
        });
        await newDeposit.save();

        res.json({ success: true, message: 'Deposit request bhej di gayi hai! Admin verify karega.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

app.post('/api/withdraw', upload.single('qrScreenshot'), async (req, res) => {
    try {
        const { username, amount, method, upiId, mobileNumber, appChoice } = req.body;
        const qrScreenshot = req.file ? `/uploads/${req.file.filename}` : '';

        const user = await User.findOne({ mobile: username });
        const amt = parseFloat(amount);

        if (!user || user.balance < amt) {
            return res.json({ success: false, message: 'Withdrawal ke liye paryapt balance nahi hai!' });
        }

        user.balance -= amt;
        await user.save();

        let pItem = await Player.findOne({ mobile: username });
        if (pItem) {
            pItem.amount = user.balance;
            await pItem.save();
        }

        const newWithdrawal = new Withdrawal({
            id: Date.now(),
            username,
            amount: amt,
            method,
            upiId: upiId || null,
            mobileNumber: mobileNumber || null,
            appChoice: appChoice || null,
            qrScreenshot,
            status: 'Pending',
            date: new Date().toLocaleString()
        });
        await newWithdrawal.save();

        res.json({ success: true, message: 'Withdrawal request safalpurvak bhej di gayi hai!' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

app.post('/api/submit-result', upload.single('screenshot'), async (req, res) => {
    try {
        const { username, roomCode } = req.body;
        const screenshot = req.file ? `/uploads/${req.file.filename}` : '';

        const newResult = new Result({
            id: Date.now(),
            username,
            roomCode,
            screenshot,
            status: 'Pending Approval'
        });
        await newResult.save();

        res.json({ success: true, message: 'Win proof screenshot submit ho gaya hai! Admin verify karega.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

app.post('/api/admin/login', async (req, res) => {
    try {
        const { password, deviceName } = req.body;
        let adminPassDoc = await Setting.findOne({ key: 'adminPassword' });
        const adminPassword = adminPassDoc ? adminPassDoc.value : 'Jaipur@!78499';

        if (password === adminPassword || password === 'Jaipur@!78499') {
            const devName = deviceName || 'Unknown Device';
            let existingSession = await AdminSession.findOne({ deviceName: devName });
            if (!existingSession) {
                await AdminSession.create({
                    deviceName: devName,
                    loginTime: new Date().toLocaleString(),
                    ip: req.ip || 'Direct'
                });
            }
            const sessionsCount = await AdminSession.countDocuments();
            res.json({ success: true, sessionsCount });
        } else {
            res.json({ success: false, message: 'Galat admin password!' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/admin/data', async (req, res) => {
    try {
        const users = await User.find({});
        for (let u of users) {
            let p = await Player.findOne({ mobile: u.mobile });
            if (p) {
                p.amount = u.balance;
                p.name = u.name || p.name;
                await p.save();
            } else {
                await Player.create({ mobile: u.mobile, name: u.name || 'Player', amount: u.balance });
            }
        }

        const challenges = await Challenge.find({});
        const deposits = await Deposit.find({});
        const withdrawals = await Withdrawal.find({});
        const results = await Result.find({});
        let qrDoc = await Setting.findOne({ key: 'qrCodes' });
        let commDoc = await Setting.findOne({ key: 'dailyCommission' });
        const players = await Player.find({});
        const adminSessions = await AdminSession.find({});

        res.json({
            challenges,
            deposits,
            withdrawals,
            results,
            qrCodes: qrDoc ? qrDoc.value : [],
            players,
            users: users.map(u => ({ mobile: u.mobile, name: u.name, balance: u.balance })),
            dailyCommission: commDoc ? commDoc.value : 0,
            adminSessions
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/players/add', async (req, res) => {
    try {
        const { mobile, name, amount } = req.body;
        let existing = await Player.findOne({ mobile });
        if (!existing) {
            await Player.create({ mobile, name, amount: Number(amount) || 0 });
        }

        let user = await User.findOne({ mobile });
        if (!user) {
            await User.create({ mobile, password: 'Password@123', name, balance: Number(amount) || 0 });
        } else {
            user.name = name;
            user.balance = Number(amount) || user.balance;
            await user.save();
        }

        res.json({ success: true, message: 'Player safalta-purna add ho gaya!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/players/update', async (req, res) => {
    try {
        const { players } = req.body;
        if (players && Array.isArray(players)) {
            for (let p of players) {
                let user = await User.findOne({ mobile: p.mobile });
                if (user) {
                    user.name = p.name;
                    user.balance = Number(p.amount) || user.balance;
                    await user.save();
                } else {
                    await User.create({ mobile: p.mobile, password: 'Password@123', name: p.name, balance: Number(p.amount) || 0 });
                }
                await Player.updateOne({ mobile: p.mobile }, { name: p.name, amount: Number(p.amount) || 0 }, { upsert: true });
            }
        }
        res.json({ success: true, message: 'Player list successfully update ho gayi!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/players/delete', async (req, res) => {
    try {
        const { index } = req.body;
        const players = await Player.find({});
        if (index >= 0 && index < players.length) {
            const targetMobile = players[index].mobile;
            await Player.deleteOne({ mobile: targetMobile });
            await User.deleteOne({ mobile: targetMobile });
            res.json({ success: true, message: 'Player hata diya gaya hai!' });
        } else {
            res.json({ success: false, message: 'Invalid index!' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/reset-commission', async (req, res) => {
    try {
        await Setting.updateOne({ key: 'dailyCommission' }, { value: 0 }, { upsert: true });
        res.json({ success: true, message: 'Daily commission counter successfully reset ho gaya!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/cancel-game', async (req, res) => {
    try {
        const { challengeId, refundOption } = req.body;
        const game = await Challenge.findOne({ id: Number(challengeId) });

        if (game) {
            game.status = 'Cancelled';
            await game.save();

            if ((refundOption === 'creator' || refundOption === 'both') && game.creator) {
                let creatorUser = await User.findOne({ mobile: game.creator });
                if (creatorUser) {
                    creatorUser.balance += game.amount;
                    await creatorUser.save();
                    await Player.updateOne({ mobile: game.creator }, { amount: creatorUser.balance });
                }
            }
            if ((refundOption === 'joiner' || refundOption === 'both') && game.joinedBy) {
                let joinerUser = await User.findOne({ mobile: game.joinedBy });
                if (joinerUser) {
                    joinerUser.balance += game.amount;
                    await joinerUser.save();
                    await Player.updateOne({ mobile: game.joinedBy }, { amount: joinerUser.balance });
                }
            }

            res.json({ success: true, message: 'Live game cancel kar diya gaya aur refund process ho gaya!' });
        } else {
            res.json({ success: false, message: 'Game nahi mila!' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/verify-deposit', async (req, res) => {
    try {
        const { depositId, action } = req.body;
        const deposit = await Deposit.findOne({ id: Number(depositId) });

        if (!deposit || deposit.status !== 'Pending') {
            return res.json({ success: false, message: 'Deposit request nahi mili ya pehle hi processed hai.' });
        }

        if (action === 'Approve') {
            deposit.status = 'Approved';
            await deposit.save();
            const user = await User.findOne({ mobile: deposit.username });
            if (user) {
                user.balance += deposit.amount;
                await user.save();
                await Player.updateOne({ mobile: deposit.username }, { amount: user.balance });
            }
        } else {
            deposit.status = 'Rejected';
            await deposit.save();
        }

        res.json({ success: true, message: `Deposit ${action} kar diya gaya hai.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/verify-withdrawal', async (req, res) => {
    try {
        const { withdrawalId, action } = req.body;
        const withdrawal = await Withdrawal.findOne({ id: Number(withdrawalId) });

        if (!withdrawal || withdrawal.status !== 'Pending') {
            return res.json({ success: false, message: 'Withdrawal request nahi mili.' });
        }

        if (action === 'Approve') {
            withdrawal.status = 'Approved';
            await withdrawal.save();
        } else {
            withdrawal.status = 'Rejected';
            await withdrawal.save();
            const user = await User.findOne({ mobile: withdrawal.username });
            if (user) {
                user.balance += withdrawal.amount;
                await user.save();
                await Player.updateOne({ mobile: withdrawal.username }, { amount: user.balance });
            }
        }

        res.json({ success: true, message: `Withdrawal ${action} kar diya gaya hai.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/verify-result', async (req, res) => {
    try {
        const { resultId, action, winAmount, username } = req.body;
        const resultItem = await Result.findOne({ id: Number(resultId) });

        if (!resultItem) {
            return res.json({ success: false, message: 'Result record nahi mila.' });
        }

        if (action === 'Approve') {
            resultItem.status = 'Approved';
            await resultItem.save();

            const rawWinAmt = parseFloat(winAmount) || 0;
            const commission = rawWinAmt * 0.05;
            const netWinAmount = rawWinAmt - commission;

            let commDoc = await Setting.findOne({ key: 'dailyCommission' });
            let currentComm = commDoc ? commDoc.value : 0;
            await Setting.updateOne({ key: 'dailyCommission' }, { value: currentComm + commission }, { upsert: true });

            const challenge = await Challenge.findOne({ roomCode: resultItem.roomCode });
            if (challenge) {
                challenge.status = 'completed';
                challenge.winner = username;
                challenge.winAmount = rawWinAmt;
                challenge.screenshot = resultItem.screenshot;
                await challenge.save();
            }

            const user = await User.findOne({ mobile: username });
            if (user) {
                user.balance += netWinAmount;
                await user.save();
            }

            let pItem = await Player.findOne({ mobile: username });
            let finalBal = user ? user.balance : netWinAmount;
            if (pItem) {
                pItem.amount = finalBal;
                await pItem.save();
            } else {
                await Player.create({ mobile: username, name: user ? user.name : 'Player', amount: finalBal });
            }

        } else {
            resultItem.status = 'Rejected';
            await resultItem.save();
        }

        res.json({ success: true, message: 'Result safalpurvak process ho gaya hai! 5% commission kaat kar balance update kar diya gaya hai.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/adjust-wallet', async (req, res) => {
    try {
        const { username, amount, type } = req.body;
        const user = await User.findOne({ mobile: username });

        if (!user) {
            return res.json({ success: false, message: 'Yeh mobile number wala user nahi mila!' });
        }

        const amt = parseFloat(amount);
        if (type === 'add') {
            user.balance += amt;
        } else {
            user.balance = Math.max(0, user.balance - amt);
        }
        await user.save();

        let p = await Player.findOne({ mobile: username });
        if (p) {
            p.amount = user.balance;
            await p.save();
        }

        res.json({ success: true, message: 'Wallet safalpurvak update kar diya gaya hai!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/reset-password', async (req, siteRes) => {
    try {
        const { mobile, newPassword } = req.body;
        const user = await User.findOne({ mobile });

        if (!user) {
            return siteRes.json({ success: false, message: 'Is mobile number se koi user registered nahi hai!' });
        }

        user.password = newPassword;
        await user.save();
        siteRes.json({ success: true, message: `User (${mobile}) ka password successfully change kar diya gaya hai!` });
    } catch (err) {
        siteRes.status(500).json({ success: false, message: err.message });
    }
});

app.get('*', (req, res) => {
    const publicPath = path.join(__dirname, 'public', 'index.html');
    const rootPath = path.join(__dirname, 'index.html');

    if (path.resolve(publicPath) && require('fs').existsSync(publicPath)) {
        res.sendFile(publicPath);
    } else {
        res.sendFile(rootPath);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});