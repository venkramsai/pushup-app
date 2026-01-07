/**
 * Pushup Pro - Application Logic
 */

const video = document.getElementById('video');
const canvas = document.getElementById('output');
const ctx = canvas.getContext('2d');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const repCountEl = document.getElementById('rep-count');
const formScoreEl = document.getElementById('form-score');
const correctionTextEl = document.getElementById('correction-text');
const feedbackOverlay = document.getElementById('feedback-overlay');
const feedbackMessage = document.getElementById('feedback-message');

// Controls & Modal
const startBtn = document.getElementById('start-btn');
const endBtn = document.getElementById('end-btn');
const summaryModal = document.getElementById('summary-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const summaryTotal = document.getElementById('summary-total');
const summaryGood = document.getElementById('summary-good');
const summaryBad = document.getElementById('summary-bad');
const summarySag = document.getElementById('summary-sag');
const summaryPike = document.getElementById('summary-pike');
const summaryShallow = document.getElementById('summary-shallow');
const exportBtn = document.getElementById('export-btn');

let detector;
let rafId;
let isCameraReady = false;

// Session State
let isSessionActive = false;
let repCount = 0;
let pushupState = 'UP'; // 'UP' or 'DOWN'
let currentScore = 0;
let scoreHistory = [];
let minElbowAngle = 180; // Track lowest point in rep

// Granular Stats
let sessionStats = {
    total: 0,
    good: 0,
    sag: 0,
    pike: 0,
    shallow: 0,
    badForm: 0 // General bad form counter
};

// Current Rep Fault Tracker
let currentRepFaults = {
    sag: false,
    pike: false,
    shallow: false
};

// Form Metrics
const FORM_THRESHOLDS = {
    elbowAngleDown: 110, // Relaxed to catch shallow reps (was 95)
    goodDepth: 90,       // New: Must go below this for good depth
    bodyAlignmentMin: 155, // Relaxed piking threshold (was 165)
    bodyAlignmentMax: 185, // Stricter: Piking if > 185 (was 195)
};

async function init() {
    try {
        setupEventListeners(); // Move listeners earlier just in case

        await setupCamera();
        statusText.innerText = 'Loading Model...';

        await createDetector();
        statusText.innerText = 'Ready to Start';
        statusDot.classList.add('ready');
        startBtn.disabled = false; // Enable button

        // Start the loop
        frameLoop();
    } catch (error) {
        statusText.innerText = 'Error: ' + error.message;
        console.error(error);
        alert('Failed to initialize app: ' + error.message);
    }
}

function setupEventListeners() {
    startBtn.addEventListener('click', startSession);
    endBtn.addEventListener('click', endSession);
    closeModalBtn.addEventListener('click', () => {
        summaryModal.classList.add('hidden');
        resetUI();
    });
    if (exportBtn) exportBtn.addEventListener('click', exportStats);
}

function exportStats() {
    const date = new Date().toLocaleDateString();
    let improvements = [];
    if (sessionStats.sag > 0) improvements.push(`Sagging (${sessionStats.sag})`);
    if (sessionStats.pike > 0) improvements.push(`Piking (${sessionStats.pike})`);
    if (sessionStats.shallow > 0) improvements.push(`Shallow (${sessionStats.shallow})`);

    const improvementStr = (improvements.length > 0 ? improvements.join('; ') : "None").replace(/"/g, '""');

    // CSV Header: Date,Number of Reps,Number of Good Reps,Improvement needed
    const csvContent = "Date,Number of Reps,Number of Good Reps,Improvement needed\n" +
        `${date},${sessionStats.total},${sessionStats.good},"${improvementStr}"`;

    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    const fileName = `pushup_stats_${new Date().toISOString().split('T')[0]}.csv`;
    link.setAttribute("download", fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function startSession() {
    isSessionActive = true;

    // Reset Stats
    repCount = 0;
    scoreHistory = [];
    sessionStats = { total: 0, good: 0, sag: 0, pike: 0, shallow: 0, badForm: 0 };
    currentRepFaults = { sag: false, pike: false, shallow: false };
    pushupState = 'UP';
    minElbowAngle = 180;

    // UI Updates
    repCountEl.innerText = '0';
    formScoreEl.innerText = '--';
    correctionTextEl.innerText = 'Go!';

    startBtn.classList.add('hidden');
    endBtn.classList.remove('hidden');

    statusText.innerText = 'Session Active';
    statusText.style.color = 'var(--primary-color)';
}

function endSession() {
    isSessionActive = false;

    // Update Summary Modal
    summaryTotal.innerText = sessionStats.total;
    summaryGood.innerText = sessionStats.good;
    summaryBad.innerText = sessionStats.badForm; // Or total - good
    summarySag.innerText = sessionStats.sag;
    summaryPike.innerText = sessionStats.pike;
    summaryShallow.innerText = sessionStats.shallow;

    // Show Modal
    summaryModal.classList.remove('hidden');

    // UI Updates
    startBtn.classList.remove('hidden');
    endBtn.classList.add('hidden');
    statusText.innerText = 'Session Complete';
    statusText.style.color = 'var(--text-secondary)';
}

function resetUI() {
    correctionTextEl.innerText = 'Get Ready';
    formScoreEl.innerText = '--';
    repCountEl.innerText = '0';
}

async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            width: 640,
            height: 480,
            frameRate: 30
        }
    });
    video.srcObject = stream;

    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            isCameraReady = true;
            resolve(video);
        };
    });
}

async function createDetector() {
    const model = poseDetection.SupportedModels.MoveNet;
    const detectorConfig = {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
    };
    detector = await poseDetection.createDetector(model, detectorConfig);
}

async function frameLoop() {
    if (detector && isCameraReady) {
        try {
            const poses = await detector.estimatePoses(video);

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (poses.length > 0) {
                const pose = poses[0];
                drawSkeleton(pose);

                if (isSessionActive) {
                    analyzePushup(pose);
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    rafId = requestAnimationFrame(frameLoop);
}

function analyzePushup(pose) {
    const keypoints = pose.keypoints;
    const minConfidence = 0.3;

    // Helper to get keypoint by name
    const getKp = (name) => keypoints.find(k => k.name === name);

    // Identify side (left or right)
    const leftShoulder = getKp('left_shoulder');
    const leftElbow = getKp('left_elbow');
    const leftWrist = getKp('left_wrist');
    const leftHip = getKp('left_hip');
    const leftKnee = getKp('left_knee');
    const leftAnkle = getKp('left_ankle');

    const rightShoulder = getKp('right_shoulder');
    const rightElbow = getKp('right_elbow');
    const rightWrist = getKp('right_wrist');
    const rightHip = getKp('right_hip');
    const rightKnee = getKp('right_knee');
    const rightAnkle = getKp('right_ankle');

    const leftConfidence = (leftShoulder?.score || 0) + (leftElbow?.score || 0) + (leftWrist?.score || 0);
    const rightConfidence = (rightShoulder?.score || 0) + (rightElbow?.score || 0) + (rightWrist?.score || 0);

    const isLeft = leftConfidence > rightConfidence;

    const shoulder = isLeft ? leftShoulder : rightShoulder;
    const elbow = isLeft ? leftElbow : rightElbow;
    const wrist = isLeft ? leftWrist : rightWrist;
    const hip = isLeft ? leftHip : rightHip;
    const knee = isLeft ? leftKnee : rightKnee;
    const ankle = isLeft ? leftAnkle : rightAnkle;

    if (shoulder.score < minConfidence || elbow.score < minConfidence || wrist.score < minConfidence || hip.score < minConfidence) {
        correctionTextEl.innerText = "Position yourself in frame (Side View)";
        correctionTextEl.style.color = "var(--text-secondary)";
        return;
    }

    // Check Orientation (Must be somewhat horizontal)
    const dx = Math.abs(shoulder.x - hip.x);
    const dy = Math.abs(shoulder.y - hip.y);

    // Relaxed check: dy should not be significantly larger than dx?
    // Actually, simply checking if dx > dy ensures roughly < 45 degrees slope.
    if (dy > dx * 1.5) { // Vertical-ish
        correctionTextEl.innerText = "Get into Pushup Position";
        correctionTextEl.style.color = "var(--text-secondary)";
        return;
    }

    // Calculate Angles
    const elbowAngle = calculateAngle(shoulder, elbow, wrist);
    const bodyAngle = calculateAngle(shoulder, hip, ankle || knee);

    drawAngle(elbow, elbowAngle);

    // --- State Machine & Analysis ---

    let isSagging = false;
    let isPiking = false;

    // NOTE: Angles depend on coordinate system.
    // Standard anatomical extension (straight body) ~ 180.
    // > 180 Usually Hyperextension (Sagging hips towards floor)
    // < 180 Usually Flexion (Piking hips up)

    if (bodyAngle > FORM_THRESHOLDS.bodyAlignmentMax) {
        correctionTextEl.innerText = "Don't sag hips!";
        correctionTextEl.style.color = "var(--accent-color)";
        isSagging = true;
    } else if (bodyAngle < FORM_THRESHOLDS.bodyAlignmentMin) {
        correctionTextEl.innerText = "Lower Hips";
        correctionTextEl.style.color = "var(--accent-color)";
        isPiking = true;
    } else {
        correctionTextEl.innerText = "Good Alignment";
        correctionTextEl.style.color = "var(--success-color)";
    }

    // Update faults for CURRENT rep
    if (isSagging) currentRepFaults.sag = true;
    if (isPiking) currentRepFaults.pike = true;

    // Rep Counter
    if (pushupState === 'UP') {
        if (elbowAngle < FORM_THRESHOLDS.elbowAngleDown) {
            pushupState = 'DOWN';
            minElbowAngle = elbowAngle; // Init min angle
        }
    } else if (pushupState === 'DOWN') {
        // Track minimum angle during the rep
        if (elbowAngle < minElbowAngle) {
            minElbowAngle = elbowAngle;
        }

        // Provide real-time depth feedback
        if (minElbowAngle > FORM_THRESHOLDS.goodDepth) {
            // Only show "Go Lower" if their form is otherwise okay (to avoid noise)
            if (!isSagging && !isPiking) {
                showTemporaryFeedback("Go Lower");
            }
        } else {
            if (!isSagging && !isPiking) {
                showTemporaryFeedback("Good Depth!");
            }
        }

        if (elbowAngle > 160) {
            // Transitions back to UP
            pushupState = 'UP';

            // Register Rep
            repCount++;
            sessionStats.total++;
            repCountEl.innerText = repCount;

            let repScore = 10;

            // Check Depth separately
            if (minElbowAngle > FORM_THRESHOLDS.goodDepth) {
                currentRepFaults.shallow = true;
            }

            // Check if ANY fault occurred during the rep
            if (currentRepFaults.sag) {
                sessionStats.sag++;
                sessionStats.badForm++;
                repScore -= 3;
                showTemporaryFeedback("Sag Detected");
            } else if (currentRepFaults.pike) {
                sessionStats.pike++;
                sessionStats.badForm++;
                repScore -= 3;
                showTemporaryFeedback("Pike Detected");
            } else if (currentRepFaults.shallow) {
                sessionStats.shallow++;
                sessionStats.badForm++;
                repScore -= 2;
                showTemporaryFeedback("Too Shallow");
            } else {
                sessionStats.good++;
            }

            updateScore(repScore);

            // Reset faults for next rep
            currentRepFaults = { sag: false, pike: false, shallow: false };
            minElbowAngle = 180;
        }
    }
}

function updateScore(repScore) {
    scoreHistory.push(repScore);
    const avgScore = scoreHistory.reduce((a, b) => a + b, 0) / scoreHistory.length;
    formScoreEl.innerText = avgScore.toFixed(1);

    if (avgScore > 8) {
        formScoreEl.style.color = "var(--success-color)";
    } else if (avgScore > 5) {
        formScoreEl.style.color = "#ffbb00"; // Orange
    } else {
        formScoreEl.style.color = "var(--accent-color)";
    }
}

function calculateAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) angle = 360.0 - angle;
    return angle;
}

function drawSkeleton(pose) {
    const keypoints = pose.keypoints;
    const connections = poseDetection.util.getAdjacentPairs(poseDetection.SupportedModels.MoveNet);

    connections.forEach(([i, j]) => {
        const kp1 = keypoints[i];
        const kp2 = keypoints[j];

        if (kp1.score > 0.3 && kp2.score > 0.3) {
            ctx.beginPath();
            ctx.moveTo(kp1.x, kp1.y);
            ctx.lineTo(kp2.x, kp2.y);
            // Color based on active/inactive
            ctx.strokeStyle = isSessionActive ? '#00f2ff' : '#444';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    });

    keypoints.forEach(kp => {
        if (kp.score > 0.3) {
            ctx.beginPath();
            ctx.arc(kp.x, kp.y, 4, 0, 2 * Math.PI);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        }
    });
}

function drawAngle(keypoint, angle) {
    if (!isSessionActive) return;
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#ffbb00';
    ctx.fillText(`${Math.round(angle)}°`, keypoint.x + 10, keypoint.y);
}

function showTemporaryFeedback(text) {
    if (!isSessionActive) return;
    feedbackMessage.innerText = text;
    feedbackOverlay.classList.remove('hidden');
    setTimeout(() => {
        feedbackOverlay.classList.add('hidden');
    }, 1500);
}

// Start App
init();
