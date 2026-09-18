# Two-minute product walkthrough

[Watch the 2:20 captioned walkthrough](media/demo.webm).

The video uses screenshots captured by Playwright from the running application,
held on screen for reading. It has no audio and is not a continuous screen
recording. No graph state or evidence was fabricated for the screenshots.
The real corpus and the authored offline sample are explicitly distinguished.

| Time | What to inspect |
| --- | --- |
| 0:00 | The real 300-page graph |
| 0:14 | Page links and their evidence |
| 0:28 | Java → designed by → James Gosling |
| 0:46 | Source revision and sentence offsets |
| 1:00 | Bounded path search |
| 1:16 | Shareable selections |
| 1:30 | Clearly labeled synthetic offline examples |
| 1:46 | Narrow-screen connection list |
| 2:02 | Verified engineering and remaining evaluation limits |

[Desktop evidence screenshot](media/real-evidence.png) ·
[Mobile screenshot](media/mobile.png) · [Caption transcript](media/chapters.json)

To regenerate, install the README's Python and frontend development dependencies,
Playwright Chromium, and `ffmpeg` on your PATH. Run from the repository root:

```sh
npm --prefix frontend run build
node frontend/record-demo.mjs
ffprobe -v error -show_entries format=duration,size -of json docs/media/demo.webm
```

The script uses the real checked-in graph, starts a temporary local server on
port 8877, captures the walkthrough, and stops the server. It requires `.venv`
at the repository root and available port 8877. The video generation is a
presentation artifact; the automated browser suite is the behavioral test.

Wikipedia excerpts retain their source terms and attribution. The evidence panel
shows revision links; see [all page sources](../data/wikipedia/SOURCES.md).
