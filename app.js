function initializeApp() {
            if (typeof firebase === 'undefined') {
                console.error('Firebase not loaded yet, retrying...');
                setTimeout(initializeApp, 100);
                return;
            }

            // Firebase Config
            const firebaseConfig = {
                apiKey: "AIzaSyAkCKw6wrA_2WfLP6NJofEDINj0TR4IPjo",
                authDomain: "absensi-def4d.firebaseapp.com",
                databaseURL: "https://absensi-def4d-default-rtdb.asia-southeast1.firebasedatabase.app",
                projectId: "absensi-def4d",
                storageBucket: "absensi-def4d.firebasestorage.app",
                messagingSenderId: "65318137326",
                appId: "1:65318137326:web:acf691897d5f2b49c4f2ff",
                measurementId: "G-D9PLB2DMF3"
            };

            try {
                firebase.initializeApp(firebaseConfig);
                const db = firebase.database();
                initializeTracker(db);
            } catch (error) {
                console.error('Firebase Error:', error);
                addDebugLog(' Firebase initialization failed: ' + error.message);
            }
        }

        function initializeTracker(db) {
            // DOM Elements
            const startButton = document.getElementById('startButton');
            const stopButton = document.getElementById('stopButton');
            const statusMessage = document.getElementById('status-message');
            const namaInput = document.getElementById('nama-karyawan');
            const debugPanel = document.getElementById('debug-panel');
            const updateCountEl = document.getElementById('update-count');
            const accuracyEl = document.getElementById('accuracy');
            const gpsIndicator = document.getElementById('gps-indicator');
            const fakeIndicator = document.getElementById('fake-indicator');
            const connectionIndicator = document.getElementById('connection-indicator');

            // Variables
            let watchId = null;
            let userId = null;
            let updateCount = 0;
            let lastPosition = null;
            let trackingInterval = null;
            let suspiciousCount = 0;
            let startTime = null;

            function addDebugLog(message) {
                const time = new Date().toLocaleTimeString();
                const logEntry = document.createElement('div');
                logEntry.textContent = `${time}: ${message}`;
                debugPanel.appendChild(logEntry);
                debugPanel.scrollTop = debugPanel.scrollHeight;
                console.log('Debug:', message);
            }

            function updateIndicator(indicator, status) {
                indicator.className = `indicator-dot ${status}`;
            }

            function updateStats() {
                updateCountEl.textContent = updateCount;
            }

            // Anti-Fake Detection System
            function detectFakeLocation(position) {
                const issues = [];
                let suspiciousScore = 0;

                // Check accuracy (GPS quality)
                if (position.coords.accuracy > 100) {
                    issues.push('Low GPS accuracy');
                    suspiciousScore += 20;
                } else if (position.coords.accuracy > 50) {
                    suspiciousScore += 10;
                }

                // Check speed calculation
                if (lastPosition) {
                    const distance = getDistance(
                        lastPosition.lat, lastPosition.lng,
                        position.coords.latitude, position.coords.longitude
                    );
                    const timeElapsed = (position.timestamp - lastPosition.timestamp) / 1000;
                    const speed = timeElapsed > 0 ? (distance / timeElapsed) * 3.6 : 0;

                    if (speed > 200) { // More than 200 km/h is suspicious
                        issues.push('Impossible speed detected');
                        suspiciousScore += 50;
                    } else if (speed > 120) {
                        issues.push('High speed detected');
                        suspiciousScore += 20;
                    }
                }

                // Check for location jumping (teleportation)
                if (lastPosition && updateCount > 5) {
                    const timeDiff = (position.timestamp - lastPosition.timestamp) / 1000;
                    const distance = getDistance(
                        lastPosition.lat, lastPosition.lng,
                        position.coords.latitude, position.coords.longitude
                    );
                    
                    if (distance > 1000 && timeDiff < 10) { // 1km in less than 10 seconds
                        issues.push('Location teleportation detected');
                        suspiciousScore += 60;
                    }
                }

                // Check for mock location indicators
                if (position.coords.accuracy === 5.0 || position.coords.accuracy === 10.0) {
                    // Common mock location accuracy values
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
                const R = 6371e3; // Earth's radius in meters
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
                
                // Update accuracy display
                accuracyEl.textContent = Math.round(position.coords.accuracy) + 'm';
                
                // Anti-fake detection
                const fakeCheck = detectFakeLocation(position);
                
                if (fakeCheck.isSuspicious) {
                    suspiciousCount++;
                    updateIndicator(fakeIndicator, 'danger');
                    addDebugLog(` Suspicious activity detected: ${fakeCheck.issues.join(', ')}`);
                } else {
                    updateIndicator(fakeIndicator, 'safe');
                }

                // Prepare data for Firebase
                const locationData = {
                    userId: userId,
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    altitude: position.coords.altitude || null,
                    heading: position.coords.heading || null, // Tambahan: data arah/heading
                    speed: position.coords.speed || null, // Tambahan: data kecepatan
                    timestamp: new Date().toISOString(),
                    localTime: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
                    unixTime: now,
                    sessionStart: startTime,
                    updateCount: updateCount,
                    suspiciousScore: fakeCheck.suspiciousScore,
                    riskLevel: fakeCheck.riskLevel,
                    issues: fakeCheck.issues,
                    status: 'active',
                    batteryOptimized: false // Could be enhanced to check battery optimization
                };

                try {
                    // Save to Firebase with timestamp as key for better querying
                    await db.ref(`tracking/${userId}/${now}`).set(locationData);
                    // Also update latest position
                    await db.ref(`latest/${userId}`).set(locationData);
                    
                    updateIndicator(connectionIndicator, 'safe');
                    addDebugLog(`📡 Location #${updateCount} sent successfully`);
                    
                    // Update UI based on risk level
                    if (fakeCheck.riskLevel === 'high') {
                        statusMessage.textContent = ` HIGH RISK - Suspicious activity detected`;
                        statusMessage.style.color = '#dc3545';
                    } else if (fakeCheck.riskLevel === 'medium') {
                        statusMessage.textContent = ` MEDIUM RISK - Monitoring closely`;
                        statusMessage.style.color = '#ffc107';
                    } else {
                        statusMessage.textContent = ` SECURE - Location verified (${updateCount} updates)`;
                        statusMessage.style.color = '#28a745';
                    }
                    
                } catch (error) {
                    updateIndicator(connectionIndicator, 'danger');
                    addDebugLog(` Failed to send location: ${error.message}`);
                    statusMessage.textContent = ' Connection failed - Retrying...';
                    statusMessage.style.color = '#dc3545';
                }

                // Store last position for next comparison
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
                statusMessage.textContent = ' GPS Error - Check permissions';
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

                userId = nama.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                startTime = Date.now();
                updateCount = 0;
                suspiciousCount = 0;
                lastPosition = null;

                // UI Updates
                startButton.disabled = true;
                stopButton.disabled = false;
                namaInput.disabled = true;
                document.querySelector('.container').classList.add('tracking-active');

                addDebugLog(` Starting secure tracking for: ${nama}`);
                statusMessage.textContent = 'Initializing secure tracking...';
                statusMessage.style.color = '#667eea';

                // Start GPS tracking with high precision
                const options = {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0 // Always get fresh location
                };

                updateIndicator(gpsIndicator, 'warning');
                watchId = navigator.geolocation.watchPosition(
                    handlePosition,
                    handleError,
                    options
                );

                // Additional tracking every second for movement detection
                trackingInterval = setInterval(() => {
                    navigator.geolocation.getCurrentPosition(
                        handlePosition,
                        handleError,
                        options
                    );
                }, 1000);

                addDebugLog(' GPS tracking initiated with 1-second precision');
            }

            async function stopTracking() {
                if (watchId) {
                    navigator.geolocation.clearWatch(watchId);
                    watchId = null;
                }

                if (trackingInterval) {
                    clearInterval(trackingInterval);
                    trackingInterval = null;
                }

                // Update status in Firebase
                if (userId) {
                    try {
                        await db.ref(`latest/${userId}`).update({
                            status: 'stopped',
                            stopTime: Date.now(),
                            finalUpdateCount: updateCount,
                            sessionDuration: Date.now() - startTime
                        });
                    } catch (error) {
                        addDebugLog(` Error updating stop status: ${error.message}`);
                    }
                }

                // UI Updates
                startButton.disabled = false;
                stopButton.disabled = true;
                namaInput.disabled = false;
                document.querySelector('.container').classList.remove('tracking-active');

                updateIndicator(gpsIndicator, 'safe');
                updateIndicator(fakeIndicator, 'safe');
                
                statusMessage.textContent = `Tracking stopped. Session: ${updateCount} updates`;
                statusMessage.style.color = '#667eea';

                addDebugLog(` Tracking stopped. Total updates: ${updateCount}, Suspicious events: ${suspiciousCount}`);
            }

            // Event Listeners
            startButton.addEventListener('click', startTracking);
            stopButton.addEventListener('click', stopTracking);
            
            namaInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter' && !startButton.disabled) {
                    startTracking();
                }
            });

            // Firebase connection monitoring
            db.ref('.info/connected').on('value', function(snapshot) {
                if (snapshot.val() === true) {
                    updateIndicator(connectionIndicator, 'safe');
                    addDebugLog(' Firebase connected');
                } else {
                    updateIndicator(connectionIndicator, 'danger');
                    addDebugLog(' Firebase disconnected');
                }
            });

            // Initialize
            addDebugLog(' Secure Tracker initialized successfully');
            namaInput.focus();
        }

        // Start initialization
        document.addEventListener('DOMContentLoaded', initializeApp);
        if (document.readyState !== 'loading') {
            initializeApp();
        };