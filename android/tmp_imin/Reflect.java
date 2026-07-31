import java.lang.reflect.*;
import java.net.*;

public class Reflect {
    public static void main(String[] args) throws Exception {
        URLClassLoader loader = new URLClassLoader(new URL[]{
            new java.io.File("classes.jar").toURI().toURL(),
            new java.io.File("C:/Users/Usuario/AppData/Local/Android/Sdk/platforms/android-36/android.jar").toURI().toURL()
        });
        Class<?> clazz = loader.loadClass("com.imin.printer.PrinterHelper");
        for (Method m : clazz.getDeclaredMethods()) {
            System.out.println(m.toString());
        }
    }
}
