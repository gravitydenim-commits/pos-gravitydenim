/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  android.content.ComponentName
 *  android.content.Context
 *  android.content.Intent
 *  android.content.ServiceConnection
 *  android.util.Log
 *  com.imin.printer.NeoPrinterManager$SingletonContainer
 *  com.imin.printer.ServiceConnectionCallback
 */
package com.imin.printer;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.util.Log;
import com.imin.printer.NeoPrinterManager;
import com.imin.printer.ServiceConnectionCallback;

/*
 * Exception performing whole class analysis ignored.
 */
public class NeoPrinterManager {
    private static final String TAG = "NeoPrinterLibrary_NeoPrinterManager";

    private NeoPrinterManager() {
    }

    public static NeoPrinterManager getInstance() {
        return SingletonContainer.access$000();
    }

    public boolean bindService(Context mContext, ServiceConnectionCallback callback) {
        if (mContext != null && callback != null) {
            Log.d((String)"NeoPrinterLibrary_NeoPrinterManager", (String)(mContext.getPackageName() + " bindService!"));
            Intent intent = new Intent();
            intent.setAction("com.imin.printerservice.NeoPrinterService");
            intent.setComponent(new ComponentName("com.imin.printerservice", "com.imin.printerservice.core.ApiAdapterManager.NeoPrinterService"));
            return mContext.getApplicationContext().bindService(intent, (ServiceConnection)callback, 1);
        }
        Log.e((String)"NeoPrinterLibrary_NeoPrinterManager", (String)"bindService parameter must be not null!");
        return false;
    }

    public void unBindService(Context mContext, ServiceConnectionCallback callback) {
        if (mContext != null && callback != null) {
            Log.d((String)"NeoPrinterLibrary_NeoPrinterManager", (String)(mContext.getPackageName() + " unBindService!"));
            mContext.getApplicationContext().unbindService((ServiceConnection)callback);
        } else {
            Log.e((String)"NeoPrinterLibrary_NeoPrinterManager", (String)"unBindService parameter must be not null!");
        }
    }
}
