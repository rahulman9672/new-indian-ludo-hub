const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'public' folder and root directory as backup
app.use(express.static('public'));
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

const STORAGE_FILE = './database.json';

// Helper to read database
function readDB() {
    if (!fs.existsSync(STORAGE_FILE)) {
        const initialData = {
            users: [],
            challenges: [],
            deposits: [],
            withdrawals: [],
            results: [],
            qrCodes: [
                { id: 1, name: 'PhonePe / AU Small Finance Bank', upiId: 'jpsmall@ybl', qrImage: 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=jpsmall@ybl' },
                { id: 2, name: 'Google Pay (GPay)', upiId: '9216290422@okbizaxis', qrImage: 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=9216290422@okbizaxis' }
            ],
            adminPassword: 'Jaipur@!78499' // Secure admin password
        };
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(initialData, null, 2));
    }
    const data = fs.readFileSync(STORAGE_FILE);
    return JSON.parse(data);
}

// Helper to write database
function writeDB(data) {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
}

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// Password validation helper
function isValidPassword(password) {
    if (!password || password.length < 8 || password.length > 12) return false;
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    return hasLower && hasUpper && hasDigit && hasSpecial;
}

// 1. User Register / Login
app.post('/api/user/auth', (req, res) => {
    const { mobile, password, name } = req.body;
    const db = readDB();

    let user = db.users.find(u => u.mobile === mobile);

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
            res.json({ success: false, message: 'Password 8 se 12 characters ka hona chahiye aur usme Uppercase, Lowercase, Number aur Special Character (@, #, $, etc.) zaroor hone chahiye!' });
            return;
        }
        const newUser = {
            mobile: mobile,
            password: password,
            name: name,
            balance: 0
        };
        db.users.push(newUser);
        writeDB(db);
        res.json({ success: true, message: 'Account safalpurvak ban gaya aur login ho gaya!', username: mobile, name: name });
    }
});

// 2. Get User Details & Balance
app.get('/api/user/:mobile', (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.mobile === req.params.mobile);
    if (user) {
        res.json({ balance: user.balance, name: user.name });
    } else {
        res.json({ balance: 0, name: '' });
    }
});

// 3. Update Password
app.post('/api/user/update-password', (req, res) => {
    const { mobile, oldPassword, newPassword } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.mobile === mobile);

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
    writeDB(db);
    res.json({ success: true, message: 'Password safalpurvak update ho gaya!' });
});

// 4. Create Challenge
app.post('/api/challenge/create', (req, res) => {
    const { username, amount, description } = req.body;
    const db = readDB();
    
    const user = db.users.find(u => u.mobile === username);
    const amt = parseFloat(amount);

    if (!user || user.balance < amt) {
        return res.json({ success: false, message: 'Aapke wallet mein paryapt balance nahi hai!' });
    }

    user.balance -= amt;

    const newChallenge = {
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
    };

    db.challenges.push(newChallenge);
    writeDB(db);
    res.json({ success: true, message: 'Challenge safalpurvak live kar diya gaya hai!' });
});

// 5. Join Challenge
app.post('/api/challenge/join', (req, res) => {
    const { challengeId, username } = req.body;
    const db = readDB();

    const challenge = db.challenges.find(c => c.id === Number(challengeId));
    if (!challenge || challenge.status !== 'Open') {
        return res.json({ success: false, message: 'Yeh challenge ab available nahi hai!' });
    }

    if (challenge.creator === username) {
        return res.json({ success: false, message: 'Aap apne hi challenge ko join nahi kar sakte!' });
    }

    const user = db.users.find(u => u.mobile === username);
    if (!user || user.balance < challenge.amount) {
        return res.json({ success: false, message: 'Aapke wallet mein join karne ke liye balance nahi hai!' });
    }

    user.balance -= challenge.amount;
    challenge.joinedBy = username;
    challenge.status = 'Running';

    writeDB(db);
    res.json({ success: true, message: 'Aapne challenge safalpurvak join kar liya hai!' });
});

// 6. Submit Room Code by Creator
app.post('/api/challenge/roomcode', (req, res) => {
    const { challengeId, roomCode, username } = req.body;
    const db = readDB();

    const challenge = db.challenges.find(c => c.id === Number(challengeId));
    if (!challenge) {
        return res.json({ success: false, message: 'Challenge nahi mila!' });
    }

    if (challenge.creator !== username) {
        return res.json({ success: false, message: 'Sirf creator hi room code bhej sakta hai!' });
    }

    challenge.roomCode = roomCode;
    challenge.status = 'Playing';

    writeDB(db);
    res.json({ success: true, message: 'Room code safalpurvak bhej diya gaya hai!' });
});

// 7. Challenge Chat Message
app.post('/api/challenge/chat', (req, res) => {
    const { challengeId, sender, message } = req.body;
    const db = readDB();

    const challenge = db.challenges.find(c => c.id === Number(challengeId));
    if (!challenge) {
        return res.json({ success: false, message: 'Challenge nahi mila!' });
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    challenge.chats.push({ sender, message, time: timeStr });

    writeDB(db);
    res.json({ success: true });
});

// 8. Submit Deposit Request
app.post('/api/deposit', upload.single('screenshot'), (req, res) => {
    const { username, amount, utr } = req.body;
    const screenshot = req.file ? `/uploads/${req.file.filename}` : '';
    const db = readDB();

    db.deposits.push({
        id: Date.now(),
        username,
        amount: parseFloat(amount),
        utr,
        screenshot,
        status: 'Pending',
        date: new Date().toLocaleString()
    });

    writeDB(db);
    res.json({ success: true, message: 'Deposit request bhej di gayi hai! Admin verify karega.' });
});

// 9. Submit Withdrawal Request
app.post('/api/withdraw', upload.single('qrScreenshot'), (req, res) => {
    const { username, amount, method, upiId, mobileNumber, appChoice } = req.body;
    const qrScreenshot = req.file ? `/uploads/${req.file.filename}` : '';
    const db = readDB();

    const user = db.users.find(u => u.mobile === username);
    const amt = parseFloat(amount);

    if (!user || user.balance < amt) {
        return res.json({ success: false, message: 'Withdrawal ke liye paryapt balance nahi hai!' });
    }

    user.balance -= amt;

    db.withdrawals.push({
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

    writeDB(db);
    res.json({ success: true, message: 'Withdrawal request safalpurvak bhej di gayi hai!' });
});

// 10. Submit Game Win Proof Result
app.post('/api/submit-result', upload.single('screenshot'), (req, res) => {
    const { username, roomCode } = req.body;
    const screenshot = req.file ? `/uploads/${req.file.filename}` : '';
    const db = readDB();

    db.results.push({
        id: Date.now(),
        username,
        roomCode,
        screenshot,
        status: 'Pending Approval'
    });

    writeDB(db);
    res.json({ success: true, message: 'Win proof screenshot submit ho gaya hai! Admin verify karega.' });
});

// 11. Admin Login
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    const db = readDB();
    if (password === db.adminPassword) {
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Galat admin password!' });
    }
});

// 12. Get All Admin Data (Including Users list for player management)
app.get('/api/admin/data', (req, res) => {
    const db = readDB();
    res.json({
        challenges: db.challenges,
        deposits: db.deposits,
        withdrawals: db.withdrawals,
        results: db.results,
        qrCodes: db.qrCodes,
        users: db.users.map(u => ({ mobile: u.mobile, name: u.name, balance: u.balance })) // Send player list safely
    });
});

// 13. Admin Verify Deposit
app.post('/api/admin/verify-deposit', (req, res) => {
    const { depositId, action } = req.body;
    const db = readDB();
    const deposit = db.deposits.find(d => d.id === Number(depositId));

    if (!deposit || deposit.status !== 'Pending') {
        return res.json({ success: false, message: 'Deposit request nahi mili ya pehle hi processed hai.' });
    }

    if (action === 'Approve') {
        deposit.status = 'Approved';
        const user = db.users.find(u => u.mobile === deposit.username);
        if (user) user.balance += deposit.amount;
    } else {
        deposit.status = 'Rejected';
    }

    writeDB(db);
    res.json({ success: true, message: `Deposit ${action} kar diya gaya hai.` });
});

// 14. Admin Verify Withdrawal
app.post('/api/admin/verify-withdrawal', (req, res) => {
    const { withdrawalId, action } = req.body;
    const db = readDB();
    const withdrawal = db.withdrawals.find(w => w.id === Number(withdrawalId));

    if (!withdrawal || withdrawal.status !== 'Pending') {
        return res.json({ success: false, message: 'Withdrawal request nahi mili.' });
    }

    if (action === 'Approve') {
        withdrawal.status = 'Approved';
    } else {
        withdrawal.status = 'Rejected';
        const user = db.users.find(u => u.mobile === withdrawal.username);
        if (user) user.balance += withdrawal.amount;
    }

    writeDB(db);
    res.json({ success: true, message: `Withdrawal ${action} kar diya gaya hai.` });
});

// 15. Admin Verify Result & Pay Winner
app.post('/api/admin/verify-result', (req, res) => {
    const { resultId, action, winAmount, username } = req.body;
    const db = readDB();
    const resultItem = db.results.find(r => r.id === Number(resultId));

    if (!resultItem) {
        return res.json({ success: false, message: 'Result record nahi mila.' });
    }

    if (action === 'Approve') {
        resultItem.status = 'Approved';
        const amt = parseFloat(winAmount);
        
        const challenge = db.challenges.find(c => c.roomCode === resultItem.roomCode);
        if (challenge) {
            challenge.status = 'completed';
            challenge.winner = username;
            challenge.winAmount = amt;
            challenge.screenshot = resultItem.screenshot;
        }

        const user = db.users.find(u => u.mobile === username);
        if (user) {
            user.balance += amt;
        }
    } else {
        resultItem.status = 'Rejected';
    }

    writeDB(db);
    res.json({ success: true, message: 'Result safalpurvak process ho gaya hai!' });
});

// 16. Admin Manual Wallet Adjust
app.post('/api/admin/adjust-wallet', (req, res) => {
    const { username, amount, type } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.mobile === username);

    if (!user) {
        return res.json({ success: false, message: 'Yeh mobile number wala user nahi mila!' });
    }

    const amt = parseFloat(amount);
    if (type === 'add') {
        user.balance += amt;
    } else {
        user.balance = Math.max(0, user.balance - amt);
    }

    writeDB(db);
    res.json({ success: true, message: 'Wallet safalpurvak update kar diya gaya hai!' });
});

// NEW API: Admin direct edit user player info & balance (Editable Player List)
app.post('/api/admin/update-user', (req, res) => {
    const { mobile, name, balance } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.mobile === mobile);

    if (!user) {
        return res.json({ success: false, message: 'User nahi mila!' });
    }

    if (name !== undefined) user.name = name;
    if (balance !== undefined) user.balance = parseFloat(balance) || 0;

    writeDB(db);
    res.json({ success: true, message: 'Player details successfully update ho gayi!' });
});

// 17. Admin Direct Password Reset (Override)
app.post('/api/admin/reset-password', (req, siteRes) => {
    const { mobile, newPassword } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.mobile === mobile);

    if (!user) {
        return siteRes.json({ success: false, message: 'Is mobile number se koi user registered nahi hai!' });
    }

    user.password = newPassword;
    writeDB(db);
    siteRes.json({ success: true, message: `User (${mobile}) ka password bina kisi condition ke successfully change kar diya gaya hai!` });
});

// Fallback Route: Try serving index.html from public or root
app.get('*', (req, res) => {
    const publicPath = path.join(__dirname, 'public', 'index.html');
    const rootPath = path.join(__dirname, 'index.html');

    if (fs.existsSync(publicPath)) {
        res.sendFile(publicPath);
    } else if (fs.existsSync(rootPath)) {
        res.sendFile(rootPath);
    } else {
        res.sendFile(publicPath);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});