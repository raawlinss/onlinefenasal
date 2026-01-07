#ifndef GAMESCENE_H
#define GAMESCENE_H

#include <QGraphicsScene>
#include <QElapsedTimer>
#include <QTimer>
#include <QVector>
#include <QPair>
#include <QImage>
#include <QPixmap>

struct KeyStatus
{
    bool m_held = false;
    bool m_released = false;
};

struct MouseStatus
{
    float m_x = 0.0f;
    float m_y = 0.0f;
    bool m_released = false;
    bool m_pressed = false;
};

class GameScene : public QGraphicsScene
{
    Q_OBJECT
public:
    explicit GameScene(QObject *parent = nullptr);

signals:

private slots:
    void loop();

private:
    void handlePlayerInput(float elapsedTime);
    void resetKeyStatus();
    void onUserCreate();
    void renderGameObjects();
    void createPixmap();
    void drawString(int x, int y, QString text);
    void renderGameScene();
    KeyStatus* m_keys[256];
    MouseStatus* m_mouse;

    const int FPS = 60;
    QTimer m_timer;
    QElapsedTimer m_elapsedTimer;
    float m_deltaTime = 0.0f, m_loopTime = 0.0f;
    const float m_loopSpeed = int(1000.0f/FPS);

    float m_distance;       // Distance car has travelled around track
    float m_curvature;      // Current track curvature, lerped between track sections
    float m_trackCurvature; // Accumulation of track curvature
    float m_trackDistance;  // Total distance of track
    float m_carPos;         // Current car position
    float m_playerCurvature;// Accumulation of player curvature
    float m_speed;          // Current player speed

    QVector<QPair<float, float> > m_vecTrack; //Track sections, sharpness of bend, length of section
    QList<float> m_listLapTimes;
    float m_currentLapTime;
    int m_carDirection;
    QImage m_image;
    QPixmap m_leftCarPixmap, m_rightCarPixmap, m_upCarPixmap;
protected:
    virtual void keyPressEvent(QKeyEvent *event) override;
    virtual void keyReleaseEvent(QKeyEvent *event) override;
    virtual void mousePressEvent(QGraphicsSceneMouseEvent *event) override;
    virtual void mouseMoveEvent(QGraphicsSceneMouseEvent *event) override;
    virtual void mouseReleaseEvent(QGraphicsSceneMouseEvent *event) override;
};

#endif // GAMESCENE_H
