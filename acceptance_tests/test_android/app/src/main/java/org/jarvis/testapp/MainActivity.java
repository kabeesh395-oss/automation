package org.jarvis.testapp;

import android.app.Activity;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.view.View;

public class MainActivity extends Activity {
    private TextView statusView;
    private Button actionBtn;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(50, 100, 50, 50);

        statusView = new TextView(this);
        statusView.setText("Initial State: Idle");
        statusView.setTextSize(22);
        layout.addView(statusView);

        actionBtn = new Button(this);
        actionBtn.setText("Perform Action");
        actionBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                statusView.setText("Action Performed: Success");
            }
        });
        layout.addView(actionBtn);

        setContentView(layout);
    }
}
