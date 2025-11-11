# Web Interface Quickstart
Serve the UI locally with `python -m http.server 8000` from the `web/` folder.
Visit http://localhost:8000/ in your browser once the server is running.
Navigation tabs appear as Calendar, Config, Console, JSON, Fixtures, and Logs.
Calendar remains a reserved workspace—avoid editing its data definitions.
Use the tab bar or command palette to switch views as you work.
Press Ctrl/Cmd+K to open or close the command palette instantly.
Press Ctrl/Cmd+1 through Ctrl/Cmd+6 to jump directly to the numbered tabs.
Open the Config tab to review environment controls and runtime status.
Click Initialize Runtime to load the Pyodide worker before running tests.
Once ready, use Run Test to confirm the runtime and view output in Console.
