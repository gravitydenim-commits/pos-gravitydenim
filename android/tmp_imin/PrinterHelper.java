/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  android.content.Context
 *  android.graphics.Bitmap
 *  android.os.RemoteException
 *  android.util.Log
 *  com.imin.printer.ILabelPrintResult
 *  com.imin.printer.INeoPrinterCallback
 *  com.imin.printer.INeoPrinterService
 *  com.imin.printer.IPrinterCallback
 *  com.imin.printer.IPrinterUpdateCallback
 *  com.imin.printer.InitPrinterCallback
 *  com.imin.printer.NeoPrinterManager
 *  com.imin.printer.ServiceConnectionCallback
 *  com.imin.printer.enums.LabelInfo
 *  com.imin.printer.label.LabelAreaStyle
 *  com.imin.printer.label.LabelBarCodeStyle
 *  com.imin.printer.label.LabelBitmapStyle
 *  com.imin.printer.label.LabelCanvasStyle
 *  com.imin.printer.label.LabelQrCodeStyle
 *  com.imin.printer.label.LabelTextStyle
 */
package com.imin.printer;

import android.content.Context;
import android.graphics.Bitmap;
import android.os.RemoteException;
import android.util.Log;
import com.imin.printer.ILabelPrintResult;
import com.imin.printer.INeoPrinterCallback;
import com.imin.printer.INeoPrinterService;
import com.imin.printer.IPrinterCallback;
import com.imin.printer.IPrinterUpdateCallback;
import com.imin.printer.InitPrinterCallback;
import com.imin.printer.NeoPrinterManager;
import com.imin.printer.ServiceConnectionCallback;
import com.imin.printer.enums.LabelInfo;
import com.imin.printer.label.LabelAreaStyle;
import com.imin.printer.label.LabelBarCodeStyle;
import com.imin.printer.label.LabelBitmapStyle;
import com.imin.printer.label.LabelCanvasStyle;
import com.imin.printer.label.LabelQrCodeStyle;
import com.imin.printer.label.LabelTextStyle;
import java.util.ArrayList;
import java.util.List;

public class PrinterHelper {
    private static final String TAG = "NeoPrinterLibrary_PrinterHelper";
    private static PrinterHelper helper = new PrinterHelper();
    private static INeoPrinterService iNeoPrinterService;
    private static InitPrinterCallback mInitPrinterCallback;
    private Context mContext;
    ServiceConnectionCallback serviceConnectionCallback = new /* Unavailable Anonymous Inner Class!! */;
    int fd;

    private PrinterHelper() {
    }

    public static PrinterHelper getInstance() {
        return helper;
    }

    public static INeoPrinterService getNeoPrinterService() {
        return iNeoPrinterService;
    }

    public boolean initPrinterService(Context context) {
        this.mContext = context;
        boolean result = NeoPrinterManager.getInstance().bindService(context, this.serviceConnectionCallback);
        Log.d((String)TAG, (String)(result ? "\u7ed1\u5b9a\u670d\u52a1\u6210\u529f" : "\u7ed1\u5b9a\u670d\u52a1\u5931\u8d25"));
        return result;
    }

    public boolean initPrinterService(Context context, InitPrinterCallback initPrinterCallback) {
        this.mContext = context;
        mInitPrinterCallback = initPrinterCallback;
        boolean result = NeoPrinterManager.getInstance().bindService(context, this.serviceConnectionCallback);
        Log.d((String)TAG, (String)(result ? "\u7ed1\u5b9a\u670d\u52a1\u6210\u529f" : "\u7ed1\u5b9a\u670d\u52a1\u5931\u8d25"));
        return result;
    }

    public void deInitPrinterService(Context context) {
        NeoPrinterManager.getInstance().unBindService(context, this.serviceConnectionCallback);
    }

    public void initPrinter(String packageName, INeoPrinterCallback callback) {
        Log.d((String)TAG, (String)("\u7ed1\u5b9a\u670d\u52a1\u6210\u529f" + (iNeoPrinterService == null || packageName == null || packageName.equals("") || packageName.length() == 0) + "    " + packageName));
        if (iNeoPrinterService == null || packageName == null || packageName.equals("") || packageName.length() == 0) {
            return;
        }
        try {
            this.fd = iNeoPrinterService.initPrinter(packageName, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void initPrinterParams() {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.initPrinterParams(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void getPrinterSerialNumber(INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.getPrinterSerialNumber(this.fd, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void getPrinterModelName(INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.getPrinterModelName(this.fd, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void getPrinterThermalHead(INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.getPrinterThermalHead(this.fd, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void getPrinterFirmwareVersion(INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.getPrinterFirmwareVersion(this.fd, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public String getServiceVersion() {
        String version = "";
        if (iNeoPrinterService == null) {
            return version;
        }
        try {
            version = iNeoPrinterService.getServiceVersion(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return version;
    }

    public int getPrinterStatus() {
        int status = -1;
        if (iNeoPrinterService == null) {
            return status;
        }
        try {
            status = iNeoPrinterService.getPrinterStatus(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return status;
    }

    public String getUsbPrinterVidPid() {
        String vidPid = "";
        if (iNeoPrinterService == null) {
            return vidPid;
        }
        try {
            vidPid = iNeoPrinterService.getUsbPrinterVidPid(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return vidPid;
    }

    public String getUsbDevicesName() {
        String devicesName = "";
        if (iNeoPrinterService == null) {
            return devicesName;
        }
        try {
            devicesName = iNeoPrinterService.getUsbDevicesName(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return devicesName;
    }

    public void setPrinterDensity(int density) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setPrinterDensity(this.fd, density);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public int getPrinterDensity() {
        int status = -1;
        if (iNeoPrinterService == null) {
            return status;
        }
        try {
            status = iNeoPrinterService.getPrinterDensity(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return status;
    }

    public void setPrinterSpeed(int density) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setPrinterSpeed(this.fd, density);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public int getPrinterSpeed() {
        int status = -1;
        if (iNeoPrinterService == null) {
            return status;
        }
        try {
            status = iNeoPrinterService.getPrinterSpeed(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return status;
    }

    public void getPrinterPaperDistance(INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.getPrinterPaperDistance(this.fd, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void getPrinterCutTimes(INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.getPrinterCutTimes(this.fd, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setPageFormat(int density) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setPageFormat(this.fd, density);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public int getPrinterMode() {
        int status = -1;
        if (iNeoPrinterService == null) {
            return status;
        }
        try {
            status = iNeoPrinterService.getPrinterMode(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return status;
    }

    public void setPrinterMode(int density) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setPrinterMode(this.fd, density);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public int getPrinterPaperType() {
        int status = -1;
        if (iNeoPrinterService == null) {
            return status;
        }
        try {
            status = iNeoPrinterService.getPrinterPaperType(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return status;
    }

    public void openDrawer() {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.openDrawer(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public boolean getDrawerStatus() {
        boolean status = false;
        if (iNeoPrinterService == null) {
            return status;
        }
        try {
            status = iNeoPrinterService.getDrawerStatus(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return status;
    }

    public int getOpenDrawerTimes() {
        int status = -1;
        if (iNeoPrinterService == null) {
            return status;
        }
        try {
            status = iNeoPrinterService.getOpenDrawerTimes(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return status;
    }

    public void printerSelfChecking(INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printerSelfChecking(this.fd, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void sendRAWData(byte[] b, INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.sendRAWData(this.fd, b, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void enterPrinterBuffer(boolean b) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.enterPrinterBuffer(this.fd, b);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void exitPrinterBuffer(boolean b) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.exitPrinterBuffer(this.fd, b);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void exitPrinterBuffer(boolean b, INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.exitPrinterBufferWithCallback(this.fd, b, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void commitPrinterBuffer() {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.commitPrinterBuffer(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void commitPrinterBuffer(INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.commitPrinterBufferWithCallback(this.fd, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setDebugLogLevel(int level) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setDebugLogLevel(this.fd, level);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setDebugLogSize(int size) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setDebugLogSize(this.fd, size);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setDebugLogModule(String module, boolean isOpen) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setDebugLogModule(this.fd, module, isOpen);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public String getDebugLogState() {
        String devicesName = "";
        if (iNeoPrinterService == null) {
            return devicesName;
        }
        try {
            devicesName = iNeoPrinterService.getDebugLogState(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return devicesName;
    }

    public void printAndLineFeed() {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printAndLineFeed(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printAndFeedPaper(int value) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printAndFeedPaper(this.fd, value);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printAndQuitPaper(int value) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printAndQuitPaper(this.fd, value);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void partialCut() {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.partialCut(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void fullCut() {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.fullCut(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setFontMultiple(int wide, int high) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setFontMultiple(this.fd, wide, high);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setFontBold(boolean bold) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setFontBold(this.fd, bold);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setFontAntiWhite(boolean antiWhite) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setFontAntiWhite(this.fd, antiWhite);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setFontItalic(boolean italic) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setFontItalic(this.fd, italic);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setFontUnderline(int underline) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setFontUnderline(this.fd, underline);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setFontRotate(int rotate) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setFontRotate(this.fd, rotate);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setFontDirection(int direction) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setFontDirection(this.fd, direction);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setFontLineSpacing(int space) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setFontLineSpacing(this.fd, space);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setFontChineseSpace(int chsLeftSpace, int chsRightSpace) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setFontChineseSpace(this.fd, chsLeftSpace, chsRightSpace);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setFontCharSpace(int space) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setFontCharSpace(this.fd, space);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setFontChineseSize(int height, int width, int underLine, int chineseType) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setFontChineseSize(this.fd, height, width, underLine, chineseType);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setFontCharSize(int height, int width, int underLine, int chineseType) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setFontCharSize(this.fd, height, width, underLine, chineseType);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setFontChineseMode(int mode) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setFontChineseMode(this.fd, mode);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setFontCountryCode(int country) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setFontCountryCode(this.fd, country);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setFontCodepage(int codepage) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setFontCodepage(this.fd, codepage);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public List<String> getFontCountryCode() {
        List<String> list = new ArrayList<String>();
        if (iNeoPrinterService == null) {
            return list;
        }
        try {
            list = iNeoPrinterService.getFontCountryCode(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return list;
    }

    public List<String> getFontCodepage() {
        List<String> list = new ArrayList<String>();
        if (iNeoPrinterService == null) {
            return list;
        }
        try {
            list = iNeoPrinterService.getFontCodepage(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return list;
    }

    public List<String> getPrinterDensityList() {
        List<String> list = new ArrayList<String>();
        if (iNeoPrinterService == null) {
            return list;
        }
        try {
            list = iNeoPrinterService.getPrinterDensityList(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return list;
    }

    public List<String> getPrinterSpeedList() {
        List<String> list = new ArrayList<String>();
        if (iNeoPrinterService == null) {
            return list;
        }
        try {
            list = iNeoPrinterService.getPrinterSpeedList(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return list;
    }

    public List<String> getPrinterPaperTypeList() {
        List<String> list = new ArrayList<String>();
        if (iNeoPrinterService == null) {
            return list;
        }
        try {
            list = iNeoPrinterService.getPrinterPaperTypeList(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return list;
    }

    public List<String> getPrinterPatternList() {
        List<String> list = new ArrayList<String>();
        if (iNeoPrinterService == null) {
            return list;
        }
        try {
            list = iNeoPrinterService.getPrinterPatternList(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return list;
    }

    public boolean supportCashBox() {
        boolean status = false;
        if (iNeoPrinterService == null) {
            return false;
        }
        try {
            status = iNeoPrinterService.supportCashBox(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return status;
    }

    public void printText(String text, INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printText(this.fd, text, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printTextWithAli(String text, int anInt, INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printTextWithAli(this.fd, text, anInt, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printTextWithEncode(String text, String code, INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printTextWithEncode(this.fd, text, code, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setCodeAlignment(int alignmentMode) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setCodeAlignment(this.fd, alignmentMode);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setTextBitmapTypeface(String typeface) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setTextBitmapTypeface(this.fd, typeface);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setTextBitmapSize(int size) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setTextBitmapSize(this.fd, size);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setTextBitmapStyle(int style) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setTextBitmapStyle(this.fd, style);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setTextBitmapStrikeThru(boolean strikeThru) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setTextBitmapStrikeThru(this.fd, strikeThru);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setTextBitmapUnderline(boolean haveUnderline) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setTextBitmapUnderline(this.fd, haveUnderline);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setTextBitmapLineSpacing(float space) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setTextBitmapLineSpacing(this.fd, space);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setTextBitmapLetterSpacing(float space) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setTextBitmapLetterSpacing(this.fd, space);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setTextBitmapAntiWhite(boolean antiWhite) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setTextBitmapAntiWhite(this.fd, antiWhite);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printTextBitmap(String text, INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printTextBitmap(this.fd, text, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printTextBitmapWithAli(String text, int align, INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printTextBitmapWithAli(this.fd, text, align, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printBitmap(Bitmap bitmap, INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printBitmap(this.fd, bitmap, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printBitmapWithAlign(Bitmap bitmap, int alignmentMode, INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printBitmapWithAlign(this.fd, bitmap, alignmentMode, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printMultiBitmap(List<Bitmap> bitmaps, INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printMultiBitmap(this.fd, bitmaps, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printMultiBitmapWithAlign(List<Bitmap> bitmaps, int alignmentMode, INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printMultiBitmapWithAlign(this.fd, bitmaps, alignmentMode, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printColumnsText(String[] colsTextArr, int[] colsWidthArr, int[] colsAlignArr, int[] colsSizeArr, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printColumnsText(this.fd, colsTextArr, colsWidthArr, colsAlignArr, colsSizeArr, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printColumnsString(String[] colsTextArr, int[] colsWidthArr, int[] colsAlignArr, int[] colsSizeArr, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printColumnsString(this.fd, colsTextArr, colsWidthArr, colsAlignArr, colsSizeArr, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setBarCodeWidth(int width) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setBarCodeWidth(this.fd, width);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setBarCodeHeight(int height) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setBarCodeHeight(this.fd, height);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setBarCodeContentPrintPos(int pos) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setBarCodeContentPrintPos(this.fd, pos);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printBarCodeWithFull(String data, int barCodeType, int width, int height, int textposition, int alignmentMode, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printBarCodeWithFull(this.fd, data, barCodeType, width, height, textposition, alignmentMode, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printBarCode(String data, int barCodeType, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printBarCode(this.fd, data, barCodeType, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printBarCodeWithAlign(String data, int barCodeType, int alignmentMode, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printBarCodeWithAlign(this.fd, data, barCodeType, alignmentMode, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setQrCodeSize(int size) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setQrCodeSize(this.fd, size);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setQrCodeErrorCorrectionLev(int size) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setQrCodeErrorCorrectionLev(this.fd, size);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setLeftMargin(int size) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setLeftMargin(this.fd, size);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printQRCodeWithFull(String data, int size, int errorlevel, int alignments, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printQRCodeWithFull(this.fd, data, size, errorlevel, alignments, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printQrCode(String data, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printQrCode(this.fd, data, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printQrCodeWithAlign(String data, int alignments, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printQrCodeWithAlign(this.fd, data, alignments, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setDoubleQRSize(int size) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setDoubleQRSize(this.fd, size);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setDoubleQR1MarginLeft(int qr1Left) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setDoubleQR1MarginLeft(this.fd, qr1Left);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setDoubleQR2MarginLeft(int qr1Left) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setDoubleQR2MarginLeft(this.fd, qr1Left);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setDoubleQR1Level(int qr1Left) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setDoubleQR1Level(this.fd, qr1Left);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setDoubleQR2Level(int qr1Left) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setDoubleQR2Level(this.fd, qr1Left);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setDoubleQR1Version(int qr1Left) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setDoubleQR1Version(this.fd, qr1Left);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setDoubleQR2Version(int qr1Left) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setDoubleQR2Version(this.fd, qr1Left);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printDoubleQR(String qr1Data, String qr2Data, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printDoubleQR(this.fd, qr1Data, qr2Data, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setPrinterUpdatePath(String path) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setPrinterUpdatePath(this.fd, path);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void getPrinterUpdateStatus(IPrinterUpdateCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.getPrinterUpdateStatus(this.fd, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void startPrinterUpdate() {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.startPrinterUpdate(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setIsUpdatePrinter(int update) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setIsUpdatePrinter(this.fd, update);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printBitmapColorChart(Bitmap bitmap, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printBitmapColorChart(this.fd, bitmap, null);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printBitmapColorChartWithAlign(Bitmap bitmap, int align, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printBitmapColorChartWithAlign(this.fd, bitmap, align, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void getPrinterHardwareVersion(INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.getPrinterHardwareVersion(this.fd, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public int getPrinterIsUpdateStatus() {
        if (iNeoPrinterService == null) {
            return 0;
        }
        try {
            return iNeoPrinterService.getPrinterIsUpdateStatus(this.fd, null);
        }
        catch (RemoteException e) {
            e.printStackTrace();
            return 0;
        }
    }

    public void updatePrinterInfo() {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.updatePrinterInfo(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setIsReconnectUsb(int reconnectUsb) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setIsReconnectUsb(this.fd, reconnectUsb);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public int getIsReconnectUsb() {
        int status = 0;
        if (iNeoPrinterService == null) {
            return status;
        }
        try {
            status = iNeoPrinterService.getIsReconnectUsb(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return status;
    }

    public void getConfigurationInfo(INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.getConfigurationInfo(this.fd, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void getPrinterKnifeReset(INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.getPrinterKnifeReset(this.fd, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void getPrinterTemperature(INeoPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.getPrinterTemperature(this.fd, (IPrinterCallback)callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public boolean getConnectInternalPrinter() {
        if (iNeoPrinterService == null) {
            return true;
        }
        try {
            return iNeoPrinterService.getConnectInternalPrinter(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
            return true;
        }
    }

    public void setConnectInternalPrinter(boolean isConnect) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setConnectInternalPrinter(this.fd, isConnect);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void checkUpdateFirmware() {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.checkUpdateFirmware(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setPrinterEncode(int encode) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setPrinterEncode(this.fd, encode);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void partialCutAndFeedPaper(int length) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.partialCutAndFeedPaper(this.fd, length);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void fullCutAndFeedPaper(int length) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.fullCutAndFeedPaper(this.fd, length);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public String getPrinterSupplierName() {
        String supplierName = "";
        if (iNeoPrinterService == null) {
            return supplierName;
        }
        try {
            supplierName = iNeoPrinterService.getPrinterSupplierName(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return supplierName;
    }

    public List<String> getEncodeList() {
        List<String> list = new ArrayList<String>();
        if (iNeoPrinterService == null) {
            return list;
        }
        try {
            list = iNeoPrinterService.getEncodeList(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return list;
    }

    public String getCurCodepage() {
        String codepage = "";
        if (iNeoPrinterService == null) {
            return codepage;
        }
        try {
            codepage = iNeoPrinterService.getCurCodepage(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return codepage;
    }

    public String getCurEncode() {
        String encode = "";
        if (iNeoPrinterService == null) {
            return encode;
        }
        try {
            encode = iNeoPrinterService.getCurEncode(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
        return encode;
    }

    public void getPrinterParameter(int code, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.getPrinterParameter(this.fd, code, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void regesiterPrinterStatusCallback(IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.regesiterPrinterStatusCallback(this.fd, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void print2DCode(String data, int symbology, int modulesize, int errorlevel, int alignments, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.print2DCode(this.fd, data, symbology, modulesize, errorlevel, alignments, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printPDF417(String data, int dataRegionColumns, int rows, int moduleWidth, int rowHeight, int errorLevel, int selectOptions, int alignments, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printPDF417(this.fd, data, dataRegionColumns, rows, moduleWidth, rowHeight, errorLevel, selectOptions, alignments, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printMaxiCode(String data, int modeType, int alignments, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printMaxiCode(this.fd, data, modeType, alignments, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printAztecCode(String data, int modeType, int dataLayers, int moduleSize, int errorLevel, int alignments, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printAztecCode(this.fd, data, modeType, dataLayers, moduleSize, errorLevel, alignments, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void printDataMatrix(String data, int symbolType, int columns, int rows, int moduleSize, int alignments, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.printDataMatrix(this.fd, data, symbolType, columns, rows, moduleSize, alignments, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void getThresholdMS2(IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.getThresholdMS2(this.fd, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void setThresholdMS2(IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.setThresholdMS2(this.fd, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void resetThresholdMS2(IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.resetThresholdMS2(this.fd, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void labelInitCanvas(LabelCanvasStyle labelCanvasStyle) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelInitCanvas(this.fd, labelCanvasStyle);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void labelAddText(String text, LabelTextStyle labelTestStyle) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelAddText(this.fd, text, labelTestStyle);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void labelAddBarCode(String codeData, LabelBarCodeStyle labelBarCodeStyle) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelAddBarcode(this.fd, codeData, labelBarCodeStyle);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void labelAddQrCode(String qrData, LabelQrCodeStyle labelQrCodeStyle) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelAddQrCode(this.fd, qrData, labelQrCodeStyle);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void labelAddBitmap(Bitmap bitmap, LabelBitmapStyle labelBitmapStyle) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelAddBitmap(this.fd, bitmap, labelBitmapStyle);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void labelAddArea(LabelAreaStyle labelAreaStyle) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelAddArea(this.fd, labelAreaStyle);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void labelPrintCanvas(int count, ILabelPrintResult iLabelPrintResult) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelPrintCanvas(this.fd, count, iLabelPrintResult);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public Bitmap getLabelBitmap() {
        if (iNeoPrinterService == null) {
            return null;
        }
        try {
            return iNeoPrinterService.getLabelBitmap(this.fd);
        }
        catch (RemoteException e) {
            e.printStackTrace();
            return null;
        }
    }

    public void labelPaperLearning(IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelPaperLearning(this.fd, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void labelGapSensorCalibration(IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelGapSensorCalibration(this.fd, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void labelTakePaperSensorLearning(int value, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelTakePaperSensorLearning(this.fd, value, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void labelSetTakePaperSensorThreshold(int value) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelSetTakePaperSensorThreshold(this.fd, value);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void labelElectricToHotLineDistance(int value) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelElectricToHotLineDistance(this.fd, value);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void labelRetractDistanceOffset(int value) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelRetractDistanceOffset(this.fd, value);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void labelSetGapMechanicalError(int value1, int value2, int value3, int value4) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelSetGapMechanicalError(this.fd, value1, value2, value3, value4);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void labelSetPrinterMode(int mode) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelSetPrinterMode(this.fd, mode);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public String labelQueryInfo(LabelInfo labelInfo) {
        if (iNeoPrinterService == null) {
            return null;
        }
        try {
            return iNeoPrinterService.labelQueryInfo(this.fd, labelInfo.name());
        }
        catch (RemoteException e) {
            e.printStackTrace();
            return null;
        }
    }

    public void labelQueryInfoCallback(LabelInfo labelInfo, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelQueryInfoCallback(this.fd, labelInfo.name(), callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void labelRestoreDefaults(IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelRestoreDefaults(this.fd, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void labelPrintBitmap(Bitmap bitmap, int width, int height, IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelPrintBitmap(this.fd, bitmap, width, height, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    public void labelGetPrinterMode(IPrinterCallback callback) {
        if (iNeoPrinterService == null) {
            return;
        }
        try {
            iNeoPrinterService.labelGetPrinterMode(this.fd, callback);
        }
        catch (RemoteException e) {
            e.printStackTrace();
        }
    }

    static /* synthetic */ INeoPrinterService access$002(INeoPrinterService x0) {
        iNeoPrinterService = x0;
        return iNeoPrinterService;
    }

    static /* synthetic */ Context access$100(PrinterHelper x0) {
        return x0.mContext;
    }

    static /* synthetic */ InitPrinterCallback access$200() {
        return mInitPrinterCallback;
    }
}
