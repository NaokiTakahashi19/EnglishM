package com.naokitakahashi.listeningdesk;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;

@CapacitorPlugin(name = "AudioLibrary")
public class AudioLibraryPlugin extends Plugin {
    private static final String PREFS_NAME = "listening-desk-audio-library";
    private static final String KEY_PLAYLIST = "playlist";
    private static final String KEY_CURRENT_URI = "current-uri";
    private static final String KEY_FOLDER_URI = "folder-uri";
    private static final int COPY_BUFFER_SIZE = 64 * 1024;
    private MediaSessionCompat mediaSession;

    @Override
    public void load() {
        mediaSession = new MediaSessionCompat(getContext(), "ListeningDesk");
        mediaSession.setFlags(
            MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS |
            MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        );
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { notifyMediaCommand("play", null); }
            @Override public void onPause() { notifyMediaCommand("pause", null); }
            @Override public void onStop() { notifyMediaCommand("stop", null); }
            @Override public void onSkipToPrevious() { notifyMediaCommand("previous", null); }
            @Override public void onSkipToNext() { notifyMediaCommand("next", null); }
            @Override public void onRewind() { notifyMediaCommand("rewind", null); }
            @Override public void onFastForward() { notifyMediaCommand("forward", null); }
            @Override public void onSeekTo(long position) { notifyMediaCommand("seekTo", position); }
        });
        mediaSession.setActive(true);
        setNativePlaybackState("paused", 0L, 1.0f);
    }

    @Override
    protected void handleOnDestroy() {
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void pickFiles(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("audio/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "filesPicked");
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        String savedFolder = preferences().getString(KEY_FOLDER_URI, null);
        if (savedFolder != null) {
            intent.putExtra("android.provider.extra.INITIAL_URI", Uri.parse(savedFolder));
        }
        startActivityForResult(call, intent, "folderPicked");
    }

    @ActivityCallback
    private void filesPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.resolve(new JSObject().put("cancelled", true).put("entries", new JSArray()));
            return;
        }

        Intent data = result.getData();
        List<Uri> uris = new ArrayList<>();
        ClipData clipData = data.getClipData();
        if (clipData != null) {
            for (int index = 0; index < clipData.getItemCount(); index += 1) {
                Uri uri = clipData.getItemAt(index).getUri();
                if (uri != null) uris.add(uri);
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }

        for (Uri uri : uris) retainReadPermission(uri, data.getFlags());
        prepareUris(call, uris, null);
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.resolve(new JSObject().put("cancelled", true).put("entries", new JSArray()));
            return;
        }

        Intent data = result.getData();
        Uri treeUri = data.getData();
        retainReadPermission(treeUri, data.getFlags());
        preferences().edit().putString(KEY_FOLDER_URI, treeUri.toString()).apply();

        execute(() -> {
            try {
                List<AudioDocument> documents = documentsInTree(treeUri);
                JSArray entries = prepareDocuments(documents);
                call.resolve(new JSObject().put("cancelled", false).put("entries", entries));
            } catch (Exception error) {
                call.reject("フォルダ内の音声を読み込めませんでした。", "FOLDER_READ_FAILED", error);
            }
        });
    }

    @PluginMethod
    public void restoreLibrary(PluginCall call) {
        execute(() -> {
            List<Uri> uris = savedPlaylistUris();
            JSArray entries = new JSArray();
            JSArray missing = new JSArray();
            for (Uri uri : uris) {
                try {
                    entries.put(prepareDocument(new AudioDocument(uri, null)));
                } catch (Exception error) {
                    missing.put(uri.toString());
                }
            }
            JSObject result = new JSObject()
                .put("entries", entries)
                .put("missing", missing)
                .put("currentUri", preferences().getString(KEY_CURRENT_URI, null))
                .put("hasFolder", preferences().contains(KEY_FOLDER_URI));
            call.resolve(result);
        });
    }

    @PluginMethod
    public void addNextFiles(PluginCall call) {
        String folderValue = preferences().getString(KEY_FOLDER_URI, null);
        if (folderValue == null) {
            call.resolve(new JSObject().put("needsFolder", true).put("entries", new JSArray()));
            return;
        }

        String afterName = call.getString("afterName", "");
        int requestedLimit = call.getInt("limit", 5);
        int limit = Math.max(1, Math.min(20, requestedLimit));
        Set<String> knownUris = new HashSet<>();
        JSArray knownArray = call.getArray("knownUris", new JSArray());
        for (int index = 0; index < knownArray.length(); index += 1) {
            String value = knownArray.optString(index, "");
            if (!value.isEmpty()) knownUris.add(value);
        }

        execute(() -> {
            try {
                List<AudioDocument> documents = documentsInTree(Uri.parse(folderValue));
                List<AudioDocument> selected = new ArrayList<>();
                for (AudioDocument document : documents) {
                    if (knownUris.contains(document.uri.toString())) continue;
                    String name = displayName(document.uri);
                    if (!afterName.isEmpty() && naturalCompare(name, afterName) <= 0) continue;
                    selected.add(document);
                    if (selected.size() >= limit) break;
                }
                call.resolve(new JSObject().put("needsFolder", false).put("entries", prepareDocuments(selected)));
            } catch (Exception error) {
                call.reject("続きの音声を読み込めませんでした。", "NEXT_FILES_FAILED", error);
            }
        });
    }

    @PluginMethod
    public void savePlaylist(PluginCall call) {
        JSArray values = call.getArray("uris", new JSArray());
        JSONArray stored = new JSONArray();
        for (int index = 0; index < values.length(); index += 1) {
            String value = values.optString(index, "");
            if (!value.isEmpty()) stored.put(value);
        }
        SharedPreferences.Editor editor = preferences().edit().putString(KEY_PLAYLIST, stored.toString());
        String currentUri = call.getString("currentUri");
        if (currentUri == null || currentUri.isEmpty()) editor.remove(KEY_CURRENT_URI);
        else editor.putString(KEY_CURRENT_URI, currentUri);
        editor.apply();
        call.resolve();
    }

    @PluginMethod
    public void updateMediaSession(PluginCall call) {
        if (mediaSession == null) {
            call.resolve();
            return;
        }
        String state = call.getString("state", "paused");
        String title = call.getString("title", "Listening Desk");
        long duration = Math.max(0L, call.getLong("duration", 0L));
        long position = Math.max(0L, call.getLong("position", 0L));
        double requestedRate = call.getDouble("rate", 1.0);
        float rate = (float) Math.max(0.1, requestedRate);

        MediaMetadataCompat metadata = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, "Listening Desk")
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "英語学習")
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, duration)
            .build();
        mediaSession.setMetadata(metadata);
        setNativePlaybackState(state, position, rate);
        call.resolve();
    }

    private void notifyMediaCommand(String command, Long position) {
        JSObject event = new JSObject().put("command", command);
        if (position != null) event.put("position", position);
        notifyListeners("mediaCommand", event, true);
    }

    private void setNativePlaybackState(String state, long position, float rate) {
        if (mediaSession == null) return;
        int nativeState;
        if ("playing".equals(state)) nativeState = PlaybackStateCompat.STATE_PLAYING;
        else if ("none".equals(state)) nativeState = PlaybackStateCompat.STATE_NONE;
        else nativeState = PlaybackStateCompat.STATE_PAUSED;
        long actions = PlaybackStateCompat.ACTION_PLAY |
            PlaybackStateCompat.ACTION_PAUSE |
            PlaybackStateCompat.ACTION_PLAY_PAUSE |
            PlaybackStateCompat.ACTION_STOP |
            PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
            PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
            PlaybackStateCompat.ACTION_REWIND |
            PlaybackStateCompat.ACTION_FAST_FORWARD |
            PlaybackStateCompat.ACTION_SEEK_TO;
        mediaSession.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(nativeState, position, nativeState == PlaybackStateCompat.STATE_PLAYING ? rate : 0f)
            .build());
    }

    private void prepareUris(PluginCall call, List<Uri> uris, String pathPrefix) {
        execute(() -> {
            try {
                List<AudioDocument> documents = new ArrayList<>();
                for (Uri uri : uris) documents.add(new AudioDocument(uri, pathPrefix));
                call.resolve(new JSObject().put("cancelled", false).put("entries", prepareDocuments(documents)));
            } catch (Exception error) {
                call.reject("音声ファイルを読み込めませんでした。", "FILE_READ_FAILED", error);
            }
        });
    }

    private void retainReadPermission(Uri uri, int resultFlags) {
        int flags = resultFlags & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, flags & Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException ignored) {
            // Some document providers grant access without supporting persisted permissions.
        }
    }

    private List<Uri> savedPlaylistUris() {
        String value = preferences().getString(KEY_PLAYLIST, "[]");
        List<Uri> uris = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(value);
            for (int index = 0; index < array.length(); index += 1) {
                String uri = array.optString(index, "");
                if (!uri.isEmpty()) uris.add(Uri.parse(uri));
            }
        } catch (JSONException ignored) {
            // A malformed list is treated as empty and can be replaced by the next import.
        }
        return uris;
    }

    private List<AudioDocument> documentsInTree(Uri treeUri) throws IOException {
        DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
        if (root == null || !root.exists() || !root.canRead()) throw new IOException("Folder is unavailable");
        List<AudioDocument> documents = new ArrayList<>();
        String rootName = root.getName() == null ? "" : root.getName();
        collectDocuments(root, rootName, documents);
        Collections.sort(documents, (left, right) -> naturalCompare(left.relativePath, right.relativePath));
        return documents;
    }

    private void collectDocuments(DocumentFile directory, String path, List<AudioDocument> output) {
        for (DocumentFile child : directory.listFiles()) {
            String name = child.getName() == null ? "" : child.getName();
            String childPath = path.isEmpty() ? name : path + "/" + name;
            if (child.isDirectory()) {
                collectDocuments(child, childPath, output);
            } else if (child.isFile() && isAudio(child.getType(), name)) {
                output.add(new AudioDocument(child.getUri(), childPath));
            }
        }
    }

    private boolean isAudio(String mimeType, String name) {
        if (mimeType != null && mimeType.toLowerCase(Locale.ROOT).startsWith("audio/")) return true;
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.endsWith(".mp3") || lower.endsWith(".m4a") || lower.endsWith(".aac") ||
            lower.endsWith(".wav") || lower.endsWith(".ogg") || lower.endsWith(".opus") || lower.endsWith(".flac");
    }

    private JSArray prepareDocuments(List<AudioDocument> documents) throws IOException {
        JSArray entries = new JSArray();
        for (AudioDocument document : documents) entries.put(prepareDocument(document));
        return entries;
    }

    private JSObject prepareDocument(AudioDocument document) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        String name = displayName(document.uri);
        String mimeType = resolver.getType(document.uri);
        if (mimeType == null || mimeType.isEmpty()) mimeType = "application/octet-stream";
        long size = queryLong(document.uri, OpenableColumns.SIZE, 0L);
        long modified = queryLong(document.uri, "last_modified", 0L);
        File cacheRoot = new File(getContext().getCacheDir(), "audio-library");
        if (!cacheRoot.exists() && !cacheRoot.mkdirs()) throw new IOException("Cannot create audio cache");
        String extension = fileExtension(name);
        File cached = new File(cacheRoot, sha256(document.uri + ":" + size + ":" + modified) + extension);
        if (!cached.exists() || (size > 0 && cached.length() != size)) copyToCache(document.uri, cached);

        String relativePath = document.relativePath == null || document.relativePath.isEmpty()
            ? name
            : document.relativePath;
        return new JSObject()
            .put("uri", document.uri.toString())
            .put("fileUrl", Uri.fromFile(cached).toString())
            .put("name", name)
            .put("size", size > 0 ? size : cached.length())
            .put("type", mimeType)
            .put("lastModified", modified)
            .put("relativePath", relativePath);
    }

    private String displayName(Uri uri) {
        String fallback = uri.getLastPathSegment() == null ? "audio" : uri.getLastPathSegment();
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (column >= 0) {
                    String name = cursor.getString(column);
                    if (name != null && !name.isEmpty()) return name;
                }
            }
        } catch (Exception ignored) {
            // Fallback to the URI segment below.
        }
        return fallback;
    }

    private long queryLong(Uri uri, String columnName, long fallback) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { columnName }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int column = cursor.getColumnIndex(columnName);
                if (column >= 0 && !cursor.isNull(column)) return cursor.getLong(column);
            }
        } catch (Exception ignored) {
            // Not every provider exposes size and modification time.
        }
        return fallback;
    }

    private void copyToCache(Uri source, File destination) throws IOException {
        File temporary = new File(destination.getParentFile(), destination.getName() + ".part");
        try (InputStream input = getContext().getContentResolver().openInputStream(source);
             FileOutputStream output = new FileOutputStream(temporary)) {
            if (input == null) throw new IOException("Cannot open selected audio");
            byte[] buffer = new byte[COPY_BUFFER_SIZE];
            int read;
            while ((read = input.read(buffer)) >= 0) output.write(buffer, 0, read);
        }
        if (destination.exists() && !destination.delete()) throw new IOException("Cannot replace cached audio");
        if (!temporary.renameTo(destination)) throw new IOException("Cannot finish cached audio");
    }

    private String fileExtension(String name) {
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot < name.length() - 8) return "";
        return name.substring(dot).replaceAll("[^A-Za-z0-9.]", "").toLowerCase(Locale.ROOT);
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte part : hash) result.append(String.format(Locale.ROOT, "%02x", part));
            return result.toString();
        } catch (NoSuchAlgorithmException impossible) {
            return Integer.toHexString(value.hashCode());
        }
    }

    private static int naturalCompare(String left, String right) {
        int leftIndex = 0;
        int rightIndex = 0;
        while (leftIndex < left.length() && rightIndex < right.length()) {
            char leftChar = Character.toLowerCase(left.charAt(leftIndex));
            char rightChar = Character.toLowerCase(right.charAt(rightIndex));
            if (Character.isDigit(leftChar) && Character.isDigit(rightChar)) {
                int leftStart = leftIndex;
                int rightStart = rightIndex;
                while (leftIndex < left.length() && Character.isDigit(left.charAt(leftIndex))) leftIndex += 1;
                while (rightIndex < right.length() && Character.isDigit(right.charAt(rightIndex))) rightIndex += 1;
                String leftNumber = left.substring(leftStart, leftIndex).replaceFirst("^0+(?!$)", "");
                String rightNumber = right.substring(rightStart, rightIndex).replaceFirst("^0+(?!$)", "");
                if (leftNumber.length() != rightNumber.length()) return Integer.compare(leftNumber.length(), rightNumber.length());
                int numberComparison = leftNumber.compareTo(rightNumber);
                if (numberComparison != 0) return numberComparison;
                continue;
            }
            if (leftChar != rightChar) return Character.compare(leftChar, rightChar);
            leftIndex += 1;
            rightIndex += 1;
        }
        return Integer.compare(left.length(), right.length());
    }

    private static final class AudioDocument {
        private final Uri uri;
        private final String relativePath;

        private AudioDocument(Uri uri, String relativePath) {
            this.uri = uri;
            this.relativePath = relativePath;
        }
    }
}
