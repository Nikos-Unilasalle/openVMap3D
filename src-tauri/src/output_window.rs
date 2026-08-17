use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// Creates (or, if already open, just focuses) the "output" window — the
/// projector-facing window. Fullscreen mode strips decorations and pins the
/// window to exactly the target monitor's bounds (belt-and-suspenders with
/// `set_fullscreen`, since a borderless window sized to the monitor is what
/// actually avoids OS fullscreen-transition flicker on some platforms);
/// windowed mode is a resizable, decorated window at half the monitor's size
/// so it can be dragged/positioned by hand.
#[tauri::command]
pub fn open_output_window(
    app: tauri::AppHandle,
    monitor_x: i32,
    monitor_y: i32,
    monitor_width: u32,
    monitor_height: u32,
    fullscreen: bool,
) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("output") {
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let mut builder =
        WebviewWindowBuilder::new(&app, "output", WebviewUrl::App("index.html#/output".into()))
            .title("Tsuji Output");

    builder = if fullscreen {
        builder
            .decorations(false)
            .skip_taskbar(true)
            .position(monitor_x as f64, monitor_y as f64)
            .inner_size(monitor_width as f64, monitor_height as f64)
    } else {
        let window_width = (monitor_width / 2).max(480) as f64;
        let window_height = (monitor_height / 2).max(270) as f64;
        builder
            .decorations(true)
            .skip_taskbar(false)
            .resizable(true)
            .position(monitor_x as f64 + 40.0, monitor_y as f64 + 40.0)
            .inner_size(window_width, window_height)
    };

    let window = builder.build().map_err(|e| e.to_string())?;
    if fullscreen {
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn close_output_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("output") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
