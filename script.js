document.addEventListener('DOMContentLoaded', async function () {
	// DOM Elements
	const cameraElement = document.getElementById('camera');
	const captureCanvas = document.getElementById('captureCanvas');
	const adjustCanvas = document.getElementById('adjustCanvas');
	const captureBtn = document.getElementById('captureBtn');
	const flipCameraBtn = document.getElementById('flipCameraBtn');
	const galleryElement = document.getElementById('gallery');
	const clearBtn = document.getElementById('clearBtn');
	const exportBtn = document.getElementById('exportBtn');

	// Global variables
	let stream = null;
	let facingMode = 'environment';
	let capturedImages = [];
	let isDetecting = false;
	let detectedCorners = [];

	// Initially disable capture button
	captureBtn.disabled = true;

	// Initialize the app
	await initCamera();

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
			stream = await navigator.mediaDevices.getUserMedia(constraints);
			cameraElement.srcObject = stream;
			cameraElement.oncanplay = function () {
				if (stream.getVideoTracks().length > 0) {
					const settings = stream.getVideoTracks()[0].getSettings();
					captureCanvas.width = settings.width;
					captureCanvas.height = settings.height;
					captureBtn.disabled = false;
				}
				startDetection();
			};
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

			cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY);
			cv.GaussianBlur(src, src, new cv.Size(5, 5), 0);
			cv.Canny(src, src, 75, 200);

			const contours = new cv.MatVector();
			const hierarchy = new cv.Mat();
			cv.findContours(src, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

			let maxArea = 0;
			let largestContour = null;
			for (let i = 0; i < contours.size(); i++) {
				const area = cv.contourArea(contours.get(i));
				if (area > maxArea) {
					maxArea = area;
					largestContour = contours.get(i);
				}
			}

			if (largestContour) {
				const color = new cv.Scalar(0, 255, 0);
				cv.drawContours(captureCanvas, contours, contours.indexOf(largestContour), color, 2);

				detectedCorners = [];
				const approx = new cv.Mat();
				const epsilon = 0.02 * cv.arcLength(largestContour, true);
				cv.approxPolyDP(largestContour, approx, epsilon, true);
				for (let i = 0; i < approx.rows; i++) {
					detectedCorners.push(new cv.Point(approx.data32S[i * 2], approx.data32S[i * 2 + 1]));
				}
			}

			src.delete();
			dst.delete();
			contours.delete();
			hierarchy.delete();
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
		if (stream) {
			stream.getTracks().forEach((track) => track.stop());
		}
		facingMode = facingMode === 'environment' ? 'user' : 'environment';
		initCamera();
	});

	// Capture image
	captureBtn.addEventListener('click', async () => {
		stopDetection();

		if (stream.getVideoTracks().length === 0) {
			console.error('No video track available');
			return;
		}

		const settings = stream.getVideoTracks()[0].getSettings();
		const width = settings.width;
		const height = settings.height;

		if (width === 0 || height === 0) {
			console.error('Video dimensions not available');
			return;
		}

		captureCanvas.width = width;
		captureCanvas.height = height;

		const context = captureCanvas.getContext('2d');
		context.drawImage(cameraElement, 0, 0, width, height);

		const src = cv.imread(captureCanvas);
		const dst = new cv.Mat();

		cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY);
		cv.GaussianBlur(src, src, new cv.Size(5, 5), 0);
		cv.Canny(src, src, 75, 200);

		const contours = new cv.MatVector();
		const hierarchy = new cv.Mat();
		cv.findContours(src, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

		let maxArea = 0;
		let largestContour = null;
		for (let i = 0; i < contours.size(); i++) {
			const area = cv.contourArea(contours.get(i));
			if (area > maxArea) {
				maxArea = area;
				largestContour = contours.get(i);
			}
		}

		if (largestContour) {
			const epsilon = 0.02 * cv.arcLength(largestContour, true);
			const approx = new cv.Mat();
			cv.approxPolyDP(largestContour, approx, epsilon, true);

			if (approx.rows === 4) {
				const points = [];
				for (let i = 0; i < 4; i++) {
					points.push(new cv.Point(approx.data32S[i * 2], approx.data32S[i * 2 + 1]));
				}

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

				cv.imshow(captureCanvas, dst);
				const croppedImageData = captureCanvas.toDataURL('image/jpeg', 0.8);

				capturedImages.push(croppedImageData);
				updateGallery();

				if (capturedImages.length > 0) {
					clearBtn.disabled = false;
					exportBtn.disabled = false;
				}
			}
			approx.delete();
		}

		src.delete();
		dst.delete();
		contours.delete();
		hierarchy.delete();

		startDetection();
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
});
