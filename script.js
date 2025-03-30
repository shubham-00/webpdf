document.addEventListener('DOMContentLoaded', function () {
	// DOM Elements.
	const cameraElement = document.getElementById('camera');
	const captureCanvas = document.getElementById('captureCanvas');
	const captureBtn = document.getElementById('captureBtn');
	const galleryElement = document.getElementById('gallery');
	const clearBtn = document.getElementById('clearBtn');
	const exportBtn = document.getElementById('exportBtn');
	const cameraSelect = document.getElementById('cameraSelect');

	// Global variables
	let stream = null;
	let capturedImages = [];
	let videoDevices = [];

	// Initially disable buttons
	clearBtn.disabled = true;
	exportBtn.disabled = true;

	// Check and request camera permissions
	async function checkCameraPermissions() {
		try {
			await navigator.mediaDevices.getUserMedia({ video: true });
			return true; // Permissions granted
		} catch (error) {
			console.error('Camera permissions denied:', error);
			return false; // Permissions denied
		}
	}

	// Initialize the camera
	async function initCamera(selectedDeviceId) {
		const hasPermission = await checkCameraPermissions();
		if (!hasPermission) {
			alert('Could not access the camera. Please check your permissions and try again.');
			return;
		}

		try {
			// Get the list of available video devices
			videoDevices = await navigator.mediaDevices.enumerateDevices();
			const videoInputs = videoDevices.filter((device) => device.kind === 'videoinput');

			if (videoInputs.length === 0) {
				alert('No video input devices found.');
				return;
			}

			// Populate the camera selection dropdown
			cameraSelect.innerHTML = '';
			videoInputs.forEach((device) => {
				const option = document.createElement('option');
				option.value = device.deviceId;
				option.textContent = device.label || `Camera ${cameraSelect.length + 1}`;
				cameraSelect.appendChild(option);
			});

			// Set constraints for the video stream
			const constraints = {
				video: {
					deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
					width: { ideal: 1280 }, // Set ideal width
					height: { ideal: 720 }, // Set ideal height
				},
			};

			// Get the media stream
			stream = await navigator.mediaDevices.getUserMedia(constraints);
			cameraElement.srcObject = stream;

			// Wait for the video metadata to load
			await new Promise((resolve) => {
				cameraElement.onloadedmetadata = () => {
					cameraElement.play(); // Ensure playback starts
					resolve();
				};
			});
		} catch (error) {
			console.error('Camera initialization error:', error);
			alert('Failed to initialize the camera. Please ensure permissions are granted and try again.');
		}
	}

	// Capture image
	captureBtn.addEventListener('click', () => {
		const width = cameraElement.videoWidth;
		const height = cameraElement.videoHeight;
		captureCanvas.width = width;
		captureCanvas.height = height;

		const context = captureCanvas.getContext('2d');
		context.drawImage(cameraElement, 0, 0, width, height);

		const imageData = captureCanvas.toDataURL('image/jpeg', 0.8);
		capturedImages.push(imageData);
		updateGallery();

		// Enable buttons if needed
		clearBtn.disabled = false;
		exportBtn.disabled = false;
	});

	// Update gallery with captured images
	function updateGallery() {
		galleryElement.innerHTML = '';

		capturedImages.forEach((img, index) => {
			const colDiv = document.createElement('div');
			colDiv.className = 'col';

			colDiv.innerHTML = `
                <div class="card h-100">
                    <div class="gallery-img-container">
                        <img src="${img}" class="gallery-img">
                        <div class="delete-btn" data-index="${index}">
                            <i class="bi bi-trash"></i>
                        </div>
                    </div>
                    <div class="card-footer">
                        <small class="text-muted">Page ${index + 1}</small>
                    </div>
                </div>
            `;

			galleryElement.appendChild(colDiv);
		});

		document.querySelectorAll('.delete-btn').forEach((btn) => {
			btn.addEventListener('click', function () {
				const index = parseInt(this.getAttribute('data-index'));
				capturedImages.splice(index, 1);
				updateGallery();

				if (capturedImages.length === 0) {
					clearBtn.disabled = true;
					exportBtn.disabled = true;
				}
			});
		});
	}

	// Clear all captured images
	clearBtn.addEventListener('click', () => {
		if (confirm('Are you sure you want to clear all scanned documents?')) {
			capturedImages = [];
			updateGallery();
			clearBtn.disabled = true;
			exportBtn.disabled = true;
		}
	});

	// Export images as PDF
	exportBtn.addEventListener('click', async () => {
		if (capturedImages.length === 0) {
			alert('No images to export');
			return;
		}

		const loadingOverlay = document.createElement('div');
		loadingOverlay.className = 'loading-overlay';
		loadingOverlay.innerHTML = `
            <div class="spinner-border text-light mb-3" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <h4>Generating PDF...</h4>
        `;
		document.body.appendChild(loadingOverlay);
		loadingOverlay.style.display = 'flex';

		await new Promise((resolve) => setTimeout(resolve, 100));

		try {
			const { jsPDF } = window.jspdf;
			const doc = new jsPDF({
				orientation: 'portrait',
				unit: 'mm',
			});

			for (let i = 0; i < capturedImages.length; i++) {
				if (i > 0) {
					doc.addPage();
				}

				const img = new Image();
				img.src = capturedImages[i];

				await new Promise((resolve) => {
					img.onload = resolve;
				});

				const pageWidth = doc.internal.pageSize.getWidth();
				const pageHeight = doc.internal.pageSize.getHeight();

				const imgRatio = img.height / img.width;
				let imgWidth = pageWidth;
				let imgHeight = imgWidth * imgRatio;

				if (imgHeight > pageHeight) {
					imgHeight = pageHeight;
					imgWidth = imgHeight / imgRatio;
				}

				const x = (pageWidth - imgWidth) / 2;
				const y = (pageHeight - imgHeight) / 2;

				doc.addImage(capturedImages[i], 'JPEG', x, y, imgWidth, imgHeight);
			}

			doc.save('scanned_document.pdf');
		} catch (error) {
			console.error('Error generating PDF:', error);
			alert('Error generating PDF. Please try again.');
		} finally {
			loadingOverlay.style.display = 'none';
			document.body.removeChild(loadingOverlay);
		}
	});

	// Switch camera
	document.getElementById('flipCameraBtn').addEventListener('click', () => {
		const selectedDeviceId = cameraSelect.value;
		initCamera(selectedDeviceId);
	});

	// Initialize the camera on page load
	initCamera();
});
