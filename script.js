document.addEventListener('DOMContentLoaded', function () {
	// DOM Elements
	const cameraElement = document.getElementById('camera');
	const captureCanvas = document.getElementById('captureCanvas');
	const captureBtn = document.getElementById('captureBtn');
	const flipCameraBtn = document.getElementById('flipCameraBtn');
	const flashlightToggleBtn = document.getElementById('flashlightToggleBtn');
	const galleryElement = document.getElementById('gallery');
	const clearBtn = document.getElementById('clearBtn');
	const exportBtn = document.getElementById('exportBtn');
	const cameraFlash = document.getElementById('cameraFlash');

	// Global variables
	let stream = null;
	let facingMode = 'environment'; // Start with the back camera
	let capturedImages = [];
	let isFlashlightOn = false; // Track flashlight state

	// Initialize the app
	initCamera();

	// Initialize the camera
	async function initCamera() {
		try {
			const constraints = {
				video: {
					facingMode: facingMode,
					width: { ideal: 1920 },
					height: { ideal: 1080 },
				},
			};

			// Stop any existing stream
			if (stream) {
				stream.getTracks().forEach((track) => track.stop());
			}

			// Get new stream
			stream = await navigator.mediaDevices.getUserMedia(constraints);
			cameraElement.srcObject = stream;
		} catch (error) {
			console.error('Error accessing camera:', error);
			alert("Could not access the camera. Please make sure it's connected and permissions are granted.");
		}
	}

	// Toggle flashlight
	flashlightToggleBtn.addEventListener('click', () => {
		if (!stream) return;

		const videoTrack = stream.getVideoTracks()[0];
		const capabilities = videoTrack.getCapabilities();

		if (capabilities.torch) {
			isFlashlightOn = !isFlashlightOn;
			videoTrack
				.applyConstraints({
					advanced: [{ torch: isFlashlightOn }],
				})
				.catch((e) => console.error('Error applying torch constraints:', e));
		} else {
			alert('Flashlight is not supported on this device.');
		}
	});

	// Flip camera (switch between front and back)
	flipCameraBtn.addEventListener('click', () => {
		facingMode = facingMode === 'environment' ? 'user' : 'environment';
		initCamera();
	});

	// Capture image
	captureBtn.addEventListener('click', () => {
		// Get the document frame element
		const documentFrame = document.querySelector('.document-frame');

		// Change border to green
		documentFrame.style.borderColor = 'rgba(40, 167, 69, 0.9)';
		documentFrame.style.borderStyle = 'solid';
		documentFrame.style.borderWidth = '3px';

		// Revert border color back to white after 1 second
		setTimeout(() => {
			documentFrame.style.borderColor = 'rgba(255, 255, 255, 0.7)';
			documentFrame.style.borderStyle = 'dashed';
			documentFrame.style.borderWidth = '2px';
		}, 1000);

		// Set canvas dimensions to match current video dimensions
		const width = cameraElement.videoWidth;
		const height = cameraElement.videoHeight;
		captureCanvas.width = width;
		captureCanvas.height = height;

		// Draw the current video frame on the canvas
		const context = captureCanvas.getContext('2d');
		context.drawImage(cameraElement, 0, 0, width, height);

		// Get the image data as a base64 string
		const imageData = captureCanvas.toDataURL('image/jpeg', 0.8);

		// Add to captured images array
		capturedImages.push(imageData);

		// Update gallery
		updateGallery();

		// Enable buttons if needed
		if (capturedImages.length > 0) {
			clearBtn.disabled = false;
			exportBtn.disabled = false;
		}
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

		// Add delete functionality to buttons
		document.querySelectorAll('.delete-btn').forEach((btn) => {
			btn.addEventListener('click', function () {
				const index = parseInt(this.getAttribute('data-index'));
				capturedImages.splice(index, 1);
				updateGallery();

				// Disable buttons if no images
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

		// Create a loading overlay
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

		// Wait for the next frame to make sure the UI updates
		await new Promise((resolve) => setTimeout(resolve, 100));

		try {
			// Initialize jsPDF
			const { jsPDF } = window.jspdf;
			const doc = new jsPDF({
				orientation: 'portrait',
				unit: 'mm',
			});

			// Add each image to the PDF
			for (let i = 0; i < capturedImages.length; i++) {
				// Add a new page for each image except the first one
				if (i > 0) {
					doc.addPage();
				}

				// Create a temporary image to get dimensions
				const img = new Image();
				img.src = capturedImages[i];

				await new Promise((resolve) => {
					img.onload = resolve;
				});

				// Calculate dimensions to fit the page
				const pageWidth = doc.internal.pageSize.getWidth();
				const pageHeight = doc.internal.pageSize.getHeight();

				const imgRatio = img.height / img.width;
				let imgWidth = pageWidth;
				let imgHeight = imgWidth * imgRatio;

				// If the image is too tall, scale by height instead
				if (imgHeight > pageHeight) {
					imgHeight = pageHeight;
					imgWidth = imgHeight / imgRatio;
				}

				// Center the image on the page
				const x = (pageWidth - imgWidth) / 2;
				const y = (pageHeight - imgHeight) / 2;

				// Add the image to the PDF
				doc.addImage(capturedImages[i], 'JPEG', x, y, imgWidth, imgHeight);
			}

			// Save the PDF
			doc.save('scanned_document.pdf');
		} catch (error) {
			console.error('Error generating PDF:', error);
			alert('Error generating PDF. Please try again.');
		} finally {
			// Remove loading overlay
			loadingOverlay.style.display = 'none';
			document.body.removeChild(loadingOverlay);
		}
	});
});
