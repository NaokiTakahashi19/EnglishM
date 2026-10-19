package com.naokitakahashi.listeningdesk;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AudioLibraryPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
