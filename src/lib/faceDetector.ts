import { FaceDetector, FilesetResolver, type Detection } from '@mediapipe/tasks-vision'

export type FaceStatusType =
  | 'INITIALIZING'
  | 'NO_FACE'
  | 'TOO_FAR'
  | 'TOO_CLOSE'
  | 'OFF_CENTER'
  | 'FACING_AWAY'
  | 'MULTIPLE_FACES'
  | 'VERIFIED'

export interface FaceValidationResult {
  status: FaceStatusType
  message: string
  isVerified: boolean
  confidence: number
  box?: {
    x: number // Percentage 0-100
    y: number // Percentage 0-100
    width: number // Percentage 0-100
    height: number // Percentage 0-100
  }
  yawAsymmetry?: number
}

let visionFileset: any = null
let faceDetectorInstance: FaceDetector | null = null
let isInitializing = false

/**
 * Initialize or get the singleton FaceDetector instance.
 * Loads WASM and the blaze_face_short_range.tflite model locally with CDN fallback.
 */
export async function getFaceDetector(): Promise<FaceDetector | null> {
  if (faceDetectorInstance) return faceDetectorInstance
  if (isInitializing) {
    // Wait until current initialization completes
    while (isInitializing) {
      await new Promise(r => setTimeout(r, 50))
    }
    return faceDetectorInstance
  }

  isInitializing = true

  try {
    // 1. Resolve WASM files (local first, fallback to CDN)
    if (!visionFileset) {
      try {
        visionFileset = await FilesetResolver.forVisionTasks('/wasm')
      } catch (localWasmErr) {
        console.warn('[FaceDetector] Local WASM load failed, falling back to CDN:', localWasmErr)
        visionFileset = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm'
        )
      }
    }

    // 2. Create detector with GPU delegate first, fallback to CPU
    try {
      faceDetectorInstance = await FaceDetector.createFromOptions(visionFileset, {
        baseOptions: {
          modelAssetPath: '/models/blaze_face_short_range.tflite',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.65
      })
    } catch (gpuErr) {
      console.warn('[FaceDetector] GPU delegate failed, falling back to CPU:', gpuErr)
      faceDetectorInstance = await FaceDetector.createFromOptions(visionFileset, {
        baseOptions: {
          modelAssetPath: '/models/blaze_face_short_range.tflite',
          delegate: 'CPU'
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.65
      })
    }

    return faceDetectorInstance
  } catch (err: any) {
    console.error('[FaceDetector] Failed to initialize MediaPipe FaceDetector:', err)
    return null
  } finally {
    isInitializing = false
  }
}

/**
 * Evaluates detections from a video frame to verify that a student is actively
 * facing the camera, within proper proximity, and centered.
 */
export function validateFaceDetection(
  detections: Detection[],
  videoWidth: number,
  videoHeight: number
): FaceValidationResult {
  if (!detections || detections.length === 0 || videoWidth === 0 || videoHeight === 0) {
    return {
      status: 'NO_FACE',
      message: 'No face detected — Please face the camera',
      isVerified: false,
      confidence: 0
    }
  }

  // Filter detections with confidence >= 0.60
  const validDetections = detections.filter(d => (d.categories?.[0]?.score ?? 0) >= 0.60)
  if (validDetections.length === 0) {
    return {
      status: 'NO_FACE',
      message: 'Please face the camera directly',
      isVerified: false,
      confidence: detections[0]?.categories?.[0]?.score ?? 0
    }
  }

  // Sort by bounding box area (largest first)
  validDetections.sort((a, b) => {
    const areaA = (a.boundingBox?.width ?? 0) * (a.boundingBox?.height ?? 0)
    const areaB = (b.boundingBox?.width ?? 0) * (b.boundingBox?.height ?? 0)
    return areaB - areaA
  })

  const primaryFace = validDetections[0]
  const bbox = primaryFace.boundingBox
  const confidence = primaryFace.categories?.[0]?.score ?? 0

  if (!bbox) {
    return {
      status: 'NO_FACE',
      message: 'No face detected',
      isVerified: false,
      confidence
    }
  }

  // Convert bounding box to percentages (0-100%) for CSS overlay rendering
  const xPct = Math.max(0, Math.min(100, (bbox.originX / videoWidth) * 100))
  const yPct = Math.max(0, Math.min(100, (bbox.originY / videoHeight) * 100))
  const wPct = Math.max(0, Math.min(100, (bbox.width / videoWidth) * 100))
  const hPct = Math.max(0, Math.min(100, (bbox.height / videoHeight) * 100))

  const box = { x: xPct, y: yPct, width: wPct, height: hPct }

  // Check for multi-student crowding in the foreground
  if (validDetections.length > 1) {
    const secondFace = validDetections[1]
    const area1 = bbox.width * bbox.height
    const area2 = (secondFace.boundingBox?.width ?? 0) * (secondFace.boundingBox?.height ?? 0)
    // If second face is also in foreground (> 55% of primary face area)
    if (area2 / area1 > 0.55) {
      return {
        status: 'MULTIPLE_FACES',
        message: 'Multiple students detected — One at a time please',
        isVerified: false,
        confidence,
        box
      }
    }
  }

  // 1. Proximity / Scale Check
  // Face width must be at least 15% of frame width to avoid far background faces
  if (wPct < 15) {
    return {
      status: 'TOO_FAR',
      message: 'Step closer to the camera',
      isVerified: false,
      confidence,
      box
    }
  }

  // Face width shouldn't exceed 78% (too close or occluded)
  if (wPct > 78) {
    return {
      status: 'TOO_CLOSE',
      message: 'Step back slightly',
      isVerified: false,
      confidence,
      box
    }
  }

  // 2. Centering Check
  const centerX = (bbox.originX + bbox.width / 2) / videoWidth
  const centerY = (bbox.originY + bbox.height / 2) / videoHeight

  if (centerX < 0.12 || centerX > 0.88 || centerY < 0.10 || centerY > 0.90) {
    return {
      status: 'OFF_CENTER',
      message: 'Center your face in the frame',
      isVerified: false,
      confidence,
      box
    }
  }

  // 3. Facing Forward / Yaw & Pitch Analysis using 6 keypoints
  // MediaPipe BlazeFace keypoints:
  // 0: right_eye, 1: left_eye, 2: nose_tip, 3: mouth_center, 4: right_ear, 5: left_ear
  const keypoints = primaryFace.keypoints
  if (keypoints && keypoints.length >= 4) {
    const rightEye = keypoints[0]
    const leftEye = keypoints[1]
    const noseTip = keypoints[2]
    const mouth = keypoints[3]

    // Calculate eye horizontal span
    const eyeSpan = Math.abs(leftEye.x - rightEye.x)

    if (eyeSpan > 0.02) {
      // Horizontal distances from each eye to nose tip
      const distRightToNose = Math.abs(noseTip.x - rightEye.x)
      const distNoseToLeft = Math.abs(leftEye.x - noseTip.x)

      // Asymmetry ratio: 0.0 is perfectly frontal, > 0.38 indicates turned head
      const yawAsymmetry = Math.abs(distRightToNose - distNoseToLeft) / eyeSpan

      if (yawAsymmetry > 0.40) {
        return {
          status: 'FACING_AWAY',
          message: 'Please look straight at the camera',
          isVerified: false,
          confidence,
          box,
          yawAsymmetry
        }
      }

      // Vertical sanity check (Pitch / head tilt)
      const avgEyeY = (rightEye.y + leftEye.y) / 2
      // If nose is above eyes (ducking upside down) or below mouth (looking straight down at ground)
      if (noseTip.y < avgEyeY || (mouth && noseTip.y > mouth.y)) {
        return {
          status: 'FACING_AWAY',
          message: 'Keep head upright facing the camera',
          isVerified: false,
          confidence,
          box,
          yawAsymmetry
        }
      }

      return {
        status: 'VERIFIED',
        message: 'Face Verified ✓ Ready to scan',
        isVerified: true,
        confidence,
        box,
        yawAsymmetry
      }
    }
  }

  // Fallback if keypoints are partially obscured but bounding box is solid
  return {
    status: 'VERIFIED',
    message: 'Face Detected ✓ Ready to scan',
    isVerified: true,
    confidence,
    box
  }
}
