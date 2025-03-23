document.addEventListener('DOMContentLoaded', function () {
	// DOM Elements
	const cameraElement = document.getElementById('camera');
	const captureCanvas = document.getElementById('captureCanvas');
	const adjustCanvas = document.getElementById('adjustCanvas'); // New canvas for adjustments
	const captureBtn = document.getElementById('captureBtn');
	const flipCameraBtn = document.getElementById('flipCameraBtn');
	const galleryElement = document.getElementById('gallery');
	const clearBtn = document.getElementById('clearBtn');
	const exportBtn = document.getElementById('exportBtn');

	// Global variables
	let stream = null;
	let facingMode = 'environment'; // Start with the back camera
	let capturedImages = [];
	let isDetecting = false; // Flag to control detection
	let detectedCorners = []; // Store detected corners for adjustment

	// Initialize the app
	initCamera();

	// Check and request camera permissions
	async function checkCameraPermissions() {
		try {
			// Request camera access
			await navigator.mediaDevices.getUserMedia({ video: true });
			return true; // Permissions granted
		} catch (error) {
			console.error('Camera permissions denied:', error);
			return false; // Permissions denied
		}
	}

	// Initialize the camera
	async function initCamera() {
		const hasPermission = await checkCameraPermissions();
		if (!hasPermission) {
			alert('Could not access the camera. Please check your permissions and try again.');
			return;
		}

		try {
			const constraints = {
				video: {
					facingMode: facingMode,
					width: { ideal: 1920 },
					height: { ideal: 1080 },
				},
			};

			// Request camera access
			stream = await navigator.mediaDevices.getUserMedia(constraints);
			cameraElement.srcObject = stream;

			// Start detecting document outlines
			startDetection();
		} catch (error) {
			console.error('Error accessing camera:', error);
			alert('Could not access the camera. Please check your permissions and try again.');
		}
	}

	// Start detecting document outlines
	function startDetection() {
		isDetecting = true;
		const detectFrame = () => {
			if (!isDetecting) return;

			const context = captureCanvas.getContext('2d');
			context.drawImage(cameraElement, 0, 0, captureCanvas.width, captureCanvas.height);
			const src = cv.imread(captureCanvas);
			const dst = new cv.Mat();

			// Convert to grayscale and apply processing
			cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY);
			cv.GaussianBlur(src, src, new cv.Size(5, 5), 0);
			cv.Canny(src, src, 75, 200);

			// Find contours
			const contours = new cv.MatVector();
			const hierarchy = new cv.Mat();
			cv.findContours(src, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

			// Find the largest contour
			let maxArea = 0;
			let largestContour = null;
			for (let i = 0; i < contours.size(); i++) {
				const area = cv.contourArea(contours.get(i));
				if (area > maxArea) {
					maxArea = area;
					largestContour = contours.get(i);
				}
			}

			// Draw the detected outline
			if (largestContour) {
				const color = new cv.Scalar(0, 255, 0); // Green color for the outline
				cv.drawContours(captureCanvas, contours, contours.indexOf(largestContour), color, 2);

				// Store detected corners for adjustment
				detectedCorners = [];
				const approx = new cv.Mat();
				const epsilon = 0.02 * cv.arcLength(largestContour, true);
				cv.approxPolyDP(largestContour, approx, epsilon, true);
				for (let i = 0; i < approx.rows; i++) {
					detectedCorners.push(new cv.Point(approx.data32S[i * 2], approx.data32S[i * 2 + 1]));
				}
			}

			// Clean up
			src.delete();
			dst.delete();
			requestAnimationFrame(detectFrame);
		};
		detectFrame();
	}

	// Stop detection
	function stopDetection() {
		isDetecting = false;
	}

	// Flip camera (switch between front and back)
	flipCameraBtn.addEventListener('click', () => {
		facingMode = facingMode === 'environment' ? 'user' : 'environment';
		initCamera();
	});

	// Capture image
	captureBtn.addEventListener('click', async () => {
		// Stop detection before capturing
		stopDetection();

		// Set canvas dimensions to match current video dimensions
		const width = cameraElement.videoWidth;
		const height = cameraElement.videoHeight;
		captureCanvas.width = width;
		captureCanvas.height = height;

		// Draw the current video frame on the canvas
		const context = captureCanvas.getContext('2d');
		context.drawImage(cameraElement, 0, 0, width, height);

		// Load the image into OpenCV
		const src = cv.imread(captureCanvas);
		const dst = new cv.Mat();

		// Convert to grayscale
		cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY);

		// Apply Gaussian blur
		cv.GaussianBlur(src, src, new cv.Size(5, 5), 0);

		// Edge detection
		cv.Canny(src, src, 75, 200);

		// Find contours
		const contours = new cv.MatVector();
		const hierarchy = new cv.Mat();
		cv.findContours(src, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

		// Find the largest contour
		let maxArea = 0;
		let largestContour = null;
		for (let i = 0; i < contours.size(); i++) {
			const area = cv.contourArea(contours.get(i));
			if (area > maxArea) {
				maxArea = area;
				largestContour = contours.get(i);
			}
		}

		// Approximate the contour to a polygon
		const epsilon = 0.02 * cv.arcLength(largestContour, true);
		const approx = new cv.Mat();
		cv.approxPolyDP(largestContour, approx, epsilon, true);

		// If we found a quadrilateral, crop the image
		if (approx.rows === 4) {
			const points = [];
			for (let i = 0; i < 4; i++) {
				points.push(new cv.Point(approx.data32S[i * 2], approx.data32S[i * 2 + 1]));
			}

			// Get the bounding box of the document
			const rect = cv.boundingRect(approx);
			const dstSize = new cv.Size(rect.width, rect.height);
			const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
				points[0].x,
				points[0].y,
				points[1].x,
				points[1].y,
				points[2].x,
				points[2].y,
				points[3].x,
				points[3].y,
			]);

			// Perform perspective transformation
			const M = cv.getPerspectiveTransform(
				dstPoints,
				cv.matFromArray(4, 1, cv.CV_32FC2, [
					0,
					0,
					dstSize.width,
					0,
					dstSize.width,
					dstSize.height,
					0,
					dstSize.height,
				]),
			);
			cv.warpPerspective(src, dst, M, dstSize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

			// Convert the cropped image to base64
			cv.imshow(captureCanvas, dst);
			const croppedImageData = captureCanvas.toDataURL('image/jpeg', 0.8);

			// Add to captured images array
			capturedImages.push(croppedImageData);

			// Update gallery
			updateGallery();

			// Enable buttons if needed
			if (capturedImages.length > 0) {
				clearBtn.disabled = false;
				exportBtn.disabled = false;
			}
		}

		// Clean up
		src.delete();
		dst.delete();
		contours.delete();
		hierarchy.delete();
		approx.delete();
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
