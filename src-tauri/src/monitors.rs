use tauri::Manager;

#[derive(serde::Serialize)]
pub struct MonitorInfo {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub is_primary: bool,
}

#[tauri::command]
pub fn list_monitors(app: tauri::AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let window = app.get_webview_window("main").ok_or("main window not found")?;
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let primary = window.primary_monitor().ok().flatten();
    let primary_pos = primary.map(|m| *m.position());

    Ok(monitors
        .into_iter()
        .map(|m| MonitorInfo {
            name: m.name().cloned().unwrap_or_default(),
            width: m.size().width,
            height: m.size().height,
            x: m.position().x,
            y: m.position().y,
            is_primary: primary_pos == Some(*m.position()),
        })
        .collect())
}
