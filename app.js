function addDebugLog(message) {
    const debugPanel = document.getElementById('debug-panel');
    const time = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.textContent = `${time}: ${message}`;
    debugPanel.appendChild(logEntry);
    debugPanel.scrollTop = debugPanel.scrollHeight;
    console.log('Debug:', message);
}

function initializeApp() {
    if (typeof firebase === 'undefined') {
        addDebugLog('Firebase not loaded yet, retrying...');
        setTimeout(initializeApp, 100);
        return;
    }

    const firebaseConfig = {
        apiKey: "AIzaSyCalf-RcByWIxdE3kyhcWwNwd8kSGX_fLE",
        authDomain: "absensi2-741f0.firebaseapp.com",
        databaseURL: "https://absensi2-741f0-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "absensi2-741f0",
        storageBucket: "absensi2-741f0.firebasestorage.app",
        messagingSenderId: "747934727309",
        appId: "1:747934727309:web:0c1fbacd980c4bdf2bb6c4",
        measurementId: "G-DGLR9P3Z33"
    };

    try {
        firebase.initializeApp(firebaseConfig);
        const db = firebase.database();
        
        firebase.auth().signInAnonymously()
            .then(() => {
                console.log("Berhasil login secara anonim:", firebase.auth().currentUser.uid);
                addDebugLog('Berhasil login anonim');
                initializeTracker(db);
            })
            .catch((error) => {
                console.error("Gagal login anonim:", error.message);
                addDebugLog('Gagal login anonim: ' + error.message);
            });

    } catch (error) {
        console.error('Firebase Error:', error);
        addDebugLog('Firebase initialization failed: ' + error.message);
    }
}

function initializeTracker(db) {
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const statusMessage = document.getElementById('status-message');
    const namaInput = document.getElementById('nama-karyawan');
    const updateCountEl = document.getElementById('update-count');
    const accuracyEl = document.getElementById('accuracy');
    const gpsIndicator = document.getElementById('gps-indicator');
    const fakeIndicator = document.getElementById('fake-indicator');
    const connectionIndicator = document.getElementById('connection-indicator');

    let watchId = null;
    let userId = null;
    let updateCount = 0;
    let lastPosition = null;
    let suspiciousCount = 0;
    let startTime = null;
    
    function updateIndicator(indicator, status) {
        indicator.className = `indicator-dot ${status}`;
    }

    function updateStats() {
        updateCountEl.textContent = updateCount;
    }

    function detectFakeLocation(position) {
        const issues = [];
        let suspiciousScore = 0;
        if (position.coords.accuracy > 100) {
            issues.push('Low GPS accuracy');
            suspiciousScore += 20;
        } else if (position.coords.accuracy > 50) {
            suspiciousScore += 10;
        }
        if (lastPosition) {
            const distance = getDistance(
                lastPosition.lat, lastPosition.lng,
                position.coords.latitude, position.coords.longitude
            );
            const timeElapsed = (position.timestamp - lastPosition.timestamp) / 1000;
            const speed = timeElapsed > 0 ? (distance / timeElapsed) * 3.6 : 0;
            if (speed > 200) {
                issues.push('Impossible speed detected');
                suspiciousScore += 50;
            } else if (speed > 120) {
                issues.push('High speed detected');
                suspiciousScore += 20;
            }
        }
        if (lastPosition && updateCount > 5) {
            const timeDiff = (position.timestamp - lastPosition.timestamp) / 1000;
            const distance = getDistance(
                lastPosition.lat, lastPosition.lng,
                position.coords.latitude, lastPosition.coords.longitude
            );
            if (distance > 1000 && timeDiff < 10) {
                issues.push('Location teleportation detected');
                suspiciousScore += 60;
            }
        }
        if (position.coords.accuracy === 5.0 || position.coords.accuracy === 10.0) {
            suspiciousScore += 15;
        }
        return {
            isSuspicious: suspiciousScore > 30,
            suspiciousScore,
            issues,
            riskLevel: suspiciousScore > 50 ? 'high' : suspiciousScore > 30 ? 'medium' : 'low'
        };
    }

    function getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3;
        const φ1 = lat1 * Math.PI/180;
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2 - lat1) * Math.PI/180;
        const Δλ = (lon2 - lon1) * Math.PI/180;
        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
    
    async function handlePosition(position) {
        updateCount++;
        const now = Date.now();
        accuracyEl.textContent = Math.round(position.coords.accuracy) + 'm';
        const fakeCheck = detectFakeLocation(position);

        if (fakeCheck.isSuspicious) {
            suspiciousCount++;
            updateIndicator(fakeIndicator, 'danger');
            addDebugLog(`⚠️ Suspicious activity: ${fakeCheck.issues.join(', ')}`);
        } else {
            updateIndicator(fakeIndicator, 'safe');
        }

        const locationData = {
            // INI BARIS KRUSIAL YANG DITAMBAHKAN
            namaKaryawan: namaInput.value.trim(), 
            // ----------------------------------
            userId: userId,
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude || null,
            heading: position.coords.heading || null,
            speed: position.coords.speed || null,
            timestamp: new Date().toISOString(),
            localTime: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
            unixTime: now,
            sessionStart: startTime,
            updateCount: updateCount,
            suspiciousScore: fakeCheck.suspiciousScore,
            riskLevel: fakeCheck.riskLevel,
            issues: fakeCheck.issues,
            status: 'active',
            batteryOptimized: false,
        };

        try {
            await db.ref('location-data/' + userId + '/' + now).set(locationData);
            await db.ref('location-data/' + userId + '/latest').set(locationData);
            
            updateIndicator(connectionIndicator, 'safe');
            addDebugLog(`📡 Lokasi #${updateCount} terkirim`);
            
            if (fakeCheck.riskLevel === 'high') {
                statusMessage.textContent = ` HIGH RISK - Aktivitas mencurigakan`;
                statusMessage.style.color = '#dc3545';
            } else if (fakeCheck.riskLevel === 'medium') {
                statusMessage.textContent = ` MEDIUM RISK - Memantau ketat`;
                statusMessage.style.color = '#ffc107';
            } else {
                statusMessage.textContent = ` SECURE - Lokasi terverifikasi (${updateCount} updates)`;
                statusMessage.style.color = '#28a745';
            }
            
        } catch (error) {
            updateIndicator(connectionIndicator, 'danger');
            addDebugLog(`💥 Gagal kirim lokasi: ${error.message}`);
            statusMessage.textContent = ' Koneksi gagal - Mencoba ulang...';
            statusMessage.style.color = '#dc3545';
        }

        lastPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            timestamp: position.timestamp
        };
        updateStats();
    }

    function handleError(error) {
        updateIndicator(gpsIndicator, 'danger');
        addDebugLog(` GPS Error: ${error.message}`);
        statusMessage.textContent = ' GPS Error - Cek izin';
        statusMessage.style.color = '#dc3545';
    }

    function startTracking() {
        const nama = namaInput.value.trim();
        if (!nama) {
            alert('Mohon masukkan nama Anda!');
            namaInput.focus();
            return;
        }
        if (nama.length < 3) {
            alert('Nama minimal 3 karakter!');
            namaInput.focus();
            return;
        }

        userId = firebase.auth().currentUser.uid;
        
        startTime = Date.now();
        updateCount = 0;
        suspiciousCount = 0;
        lastPosition = null;

        startButton.disabled = true;
        stopButton.disabled = false;
        namaInput.disabled = true;
        document.querySelector('.container').classList.add('tracking-active');

        addDebugLog(`🚀 Memulai tracking aman untuk: ${nama}`);
        statusMessage.textContent = 'Memulai tracking aman...';
        statusMessage.style.color = '#667eea';

        const options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        };

        updateIndicator(gpsIndicator, 'warning');
        watchId = navigator.geolocation.watchPosition(
            handlePosition,
            handleError,
            options
        );

        addDebugLog(' GPS tracking dimulai dengan presisi 1 detik');
    }

    async function stopTracking() {
        if (watchId) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }

        if (userId) {
            try {
                await db.ref('location-data/' + userId + '/latest').update({
                    status: 'stopped',
                    stopTime: Date.now(),
                    finalUpdateCount: updateCount,
                    sessionDuration: Date.now() - startTime
                });
            } catch (error) {
                addDebugLog(` Gagal perbarui status berhenti: ${error.message}`);
            }
        }

        startButton.disabled = false;
        stopButton.disabled = true;
        namaInput.disabled = false;
        document.querySelector('.container').classList.remove('tracking-active');
        updateIndicator(gpsIndicator, 'safe');
        updateIndicator(fakeIndicator, 'safe');
        statusMessage.textContent = `Tracking berhenti. Sesi: ${updateCount} updates`;
        statusMessage.style.color = '#667eea';
        addDebugLog(` Tracking berhenti. Total updates: ${updateCount}, Kejadian mencurigakan: ${suspiciousCount}`);
    }

    startButton.addEventListener('click', startTracking);
    stopButton.addEventListener('click', stopTracking);
    namaInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !startButton.disabled) {
            startTracking();
        }
    });

    db.ref('.info/connected').on('value', function(snapshot) {
        if (snapshot.val() === true) {
            updateIndicator(connectionIndicator, 'safe');
            addDebugLog(' Firebase terhubung');
        } else {
            updateIndicator(connectionIndicator, 'danger');
            addDebugLog(' Firebase terputus');
        }
    });

    addDebugLog(' Secure Tracker berhasil diinisialisasi');
    namaInput.focus();
}

document.addEventListener('DOMContentLoaded', initializeApp);
if (document.readyState !== 'loading') {
    initializeApp();
};
