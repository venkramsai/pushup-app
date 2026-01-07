# Pushup Pro - AI Form Assistant

Pushup Pro is a web-based application that uses computer vision (MoveNet via TensorFlow.js) to analyze pushup form in real-time. It provides instant feedback on depth, body alignment, and counts repetitions automatically.

## Features

- **Real-time Form Analysis**: Detects sagging hips, piking (hips too high), and shallow reps.
- **Automatic Rep Counting**: Counts valid repetitions only when proper depth is achieved.
- **Form Score**: Calculates a dynamic score based on the quality of each repetition.
- **Privacy First**: All processing happens locally in your browser. No video is uploaded to any server.
- **Export Stats**: Download your workout statistics as a CSV file.

## How to Run

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/venkramsai/pushup-app.git
    cd pushup-app
    ```

2.  **Start a local server**:
    Because the application uses the camera and loads local model files, it must be served via a web server (not by opening the file directly).

    Python 3:
    ```bash
    python3 -m http.server 8000
    ```

    Or using Node.js/http-server:
    ```bash
    npx http-server .
    ```

3.  **Open the app**:
    Open your browser and navigate to `http://localhost:8000`.

## Tech Stack

- **HTML5 & CSS3**: For the user interface.
- **JavaScript (ES6+)**: Application logic.
- **TensorFlow.js**: For running the MoveNet model in the browser.
- **MoveNet SinglePose Lightning**: Efficient pose detection model optimized for speed.

## Troubleshooting

- **"Failed to initialize app"**: Ensure you are running the app through a local web server (http://localhost:8000), not by opening the `index.html` file directly.
- **Camera Access**: Make sure to allow camera permissions when prompted.
