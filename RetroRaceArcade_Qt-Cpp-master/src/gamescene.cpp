#include "gamescene.h"
#include <QKeyEvent>
#include <QGraphicsSceneMouseEvent>
#include <QDebug>
#include <QGraphicsPixmapItem>
#include <QGraphicsSimpleTextItem>
#include <QDir>
#include <QPainter>
#include <cmath>
#include "utils.h"

GameScene::GameScene(QObject *parent)
    : QGraphicsScene(parent),
      m_distance(0.0f),
      m_curvature(0.0f),
      m_trackCurvature(0.0f),
      m_trackDistance(0.0f),
      m_carPos(0.0f),
      m_playerCurvature(0.0f),
      m_speed(0.0f),
      m_carDirection(0)
{
    //
    onUserCreate();
    m_image = QImage(SCREEN::LOGICAL_SIZE, QImage::Format_RGB32);
    createPixmap();
    //
    for(int i = 0; i < 256; ++i)
    {
        m_keys[i] = new KeyStatus();
    }
    m_mouse = new MouseStatus();
    setSceneRect(0,0, SCREEN::PHYSICAL_SIZE.width(), SCREEN::PHYSICAL_SIZE.height());
    connect(&m_timer, &QTimer::timeout, this, &GameScene::loop);
    m_timer.start(int(1000.0f/FPS));
    m_elapsedTimer.start();
}

void GameScene::loop()
{
    m_deltaTime = m_elapsedTimer.elapsed();
    m_elapsedTimer.restart();

    m_loopTime += m_deltaTime;
    while( m_loopTime > m_loopSpeed)
    {
        float elapsedTime = 1.0f/m_loopSpeed;
        m_image.fill(QColor(Qt::gray));
        handlePlayerInput(elapsedTime);
        //Helping variables
        const int LogicalWidth  = SCREEN::LOGICAL_SIZE.width();
        const int LogicalHeight = SCREEN::LOGICAL_SIZE.height();

        // If car curvature is too different to track curvature, slow down
        // as car has gone off track
        if (std::fabs(m_playerCurvature - m_trackCurvature) >= 0.8f)
        {
            m_speed -= 5.0f * elapsedTime;
        }

        // Clamp Speed
        if (m_speed < 0.0f)
        {
            m_speed = 0.0f;
        }
        if (m_speed > 1.0f)
        {
            m_speed = 1.0f;
        }

        // Move car along track according to car speed
        m_distance += (70.0f * m_speed) * elapsedTime;

        // Get Point on track
        float fOffset = 0;
        int nTrackSection = 0;

        // Lap Timing and counting
        m_currentLapTime += elapsedTime;
        if (m_distance >= m_trackDistance)
        {
            m_distance -= m_trackDistance;
            m_listLapTimes.push_front(m_currentLapTime);
            m_listLapTimes.pop_back();
            m_currentLapTime = 0.0f;
        }

        // Find position on track (could optimise)
        while (nTrackSection < m_vecTrack.size() && fOffset <= m_distance)
        {
            fOffset += m_vecTrack[nTrackSection].second;
            nTrackSection++;
        }

        // Interpolate towards target track curvature
        if(!nTrackSection)
        {
            nTrackSection = 1;
        }
        float fTargetCurvature = m_vecTrack[nTrackSection - 1].first;
        float fTrackCurveDiff = (fTargetCurvature - m_curvature) * elapsedTime * m_speed;

        // Accumulate player curvature
        m_curvature += fTrackCurveDiff;

        // Accumulate track curvature
        m_trackCurvature += (m_curvature) * elapsedTime * m_speed;

        // Draw Sky - light blue and dark blue
        for (int y = 0; y < LogicalHeight / 2; y++)
        {
            for (int x = 0; x < LogicalWidth; x++)
            {
                m_image.setPixelColor(x, y, y < LogicalHeight / 4 ? Qt::blue : Qt::darkBlue);
            }
        }

        // Draw Scenery - our hills are a rectified sine wave, where the phase is adjusted by the
        // accumulated track curvature
        for (int x = 0; x < LogicalWidth; x++)
        {
            int nHillHeight = (int)(fabs(sinf(x * 0.01f + m_trackCurvature) * 16.0f));
            for (int y = (LogicalHeight / 2) - nHillHeight; y < LogicalHeight / 2; y++)
            {
                m_image.setPixelColor(x, y, Qt::darkYellow);
            }

        }

        // Draw Track - Each row is split into grass, clip-board and track
        for(int y = 0; y < LogicalHeight/2; ++y)
        {
            for(int x = 0; x < LogicalWidth; ++x)
            {
                // Perspective is used to modify the width of the track row segments
                float fPerspective = (float)y / (LogicalHeight/2.0f);
                float fRoadWidth = 0.1f + fPerspective * 0.8f; // Min 10% Max 90%
                float fClipWidth = fRoadWidth * 0.15f;
                fRoadWidth *= 0.5f;	// Halve it as track is symmetrical around center of track, but offset...
                // ...depending on where the middle point is, which is defined by the current
                // track curvature.
                float fMiddlePoint = 0.5f + m_curvature * powf((1.0f - fPerspective), 3);
                // Work out segment boundaries
                int nLeftGrass = (fMiddlePoint - fRoadWidth - fClipWidth) * LogicalWidth;
                int nLeftClip = (fMiddlePoint - fRoadWidth) * LogicalWidth;
                int nRightClip = (fMiddlePoint + fRoadWidth) * LogicalWidth;
                int nRightGrass = (fMiddlePoint + fRoadWidth + fClipWidth) * LogicalWidth;

                int nRow = LogicalHeight / 2 + y;
                // Using periodic oscillatory functions to give lines, where the phase is controlled
                // by the distance around the track. These take some fine tuning to give the right "feel"
                QColor nGrassColour = sinf(20.0f *  powf(1.0f - fPerspective,3) + m_distance * 0.1f) > 0.0f ? Qt::green : Qt::darkGreen;
                QColor nClipColour = sinf(80.0f *  powf(1.0f - fPerspective, 2) + m_distance) > 0.0f ? Qt::red : Qt::white;

                // Start finish straight changes the road colour to inform the player lap is reset
                QColor nRoadColour = (nTrackSection-1) == 0 ? Qt::white : Qt::gray;

                // Draw the row segments
                if (x >= 0 && x < nLeftGrass)
                {
                    m_image.setPixelColor(x, nRow, nGrassColour);
                }
                if (x >= nLeftGrass && x < nLeftClip)
                {
                    m_image.setPixelColor(x, nRow, nClipColour);
                }
                if (x >= nLeftClip && x < nRightClip)
                {
                    m_image.setPixelColor(x, nRow, nRoadColour);
                }
                if (x >= nRightClip && x < nRightGrass)
                {
                    m_image.setPixelColor(x, nRow, nClipColour);
                }
                if (x >= nRightGrass && x < LogicalWidth)
                {
                    m_image.setPixelColor(x, nRow, nGrassColour);
                }
            }
        }

        // Draw Car - car position on road is proportional to difference between
        // current accumulated track curvature, and current accumulated player curvature
        // i.e. if they are similar, the car will be in the middle of the track
        m_carPos = m_playerCurvature - m_trackCurvature;


        renderGameObjects();
        //add boundary
        setBackgroundBrush(Qt::black);
        QGraphicsRectItem* lItem = new QGraphicsRectItem();
        lItem->setRect(0,0, SCREEN::PHYSICAL_SIZE.width(), SCREEN::PHYSICAL_SIZE.height());
        lItem->setPen(QColor(Qt::black));
        lItem->setBrush(QColor(Qt::black));
        lItem->setPos(-SCREEN::PHYSICAL_SIZE.width(), 0);
        addItem(lItem);

        QGraphicsRectItem* rItem = new QGraphicsRectItem();
        rItem->setRect(0,0, SCREEN::PHYSICAL_SIZE.width(), SCREEN::PHYSICAL_SIZE.height());
        rItem->setPen(QColor(Qt::black));
        rItem->setBrush(QColor(Qt::black));
        rItem->setPos(+SCREEN::PHYSICAL_SIZE.width(), 0);
        addItem(rItem);

        m_loopTime -= m_loopSpeed;
        resetKeyStatus();
    }
}

void GameScene::handlePlayerInput(float elapsedTime)
{
    m_carDirection = 0;

    if (m_keys[KEYBOARD::KEY_UP]->m_held || m_keys[KEYBOARD::KEY_W]->m_held)
    {
        m_speed += 2.0f * elapsedTime;
    }
    else
    {
        m_speed -= 1.0f * elapsedTime;
    }

    // Car Curvature is accumulated left/right input, but inversely proportional to speed
    // i.e. it is harder to turn at high speed
    if (m_keys[KEYBOARD::KEY_LEFT]->m_held || m_keys[KEYBOARD::KEY_A]->m_held)
    {
        m_playerCurvature -= 0.7f * elapsedTime * (1.0f - m_speed / 2.0f);
        m_carDirection = -1;
    }

    if (m_keys[KEYBOARD::KEY_RIGHT]->m_held || m_keys[KEYBOARD::KEY_D]->m_held)
    {
        m_playerCurvature += 0.7f * elapsedTime * (1.0f - m_speed / 2.0f);
        m_carDirection = +1;
    }

    if(m_keys[KEYBOARD::KEY_Z]->m_released)
    {
        renderGameScene();
    }
}

void GameScene::resetKeyStatus()
{
    for(int i = 0; i < 256; ++i)
    {
        m_keys[i]->m_released = false;
    }
    m_mouse->m_released = false;
}

void GameScene::onUserCreate()
{
    // Define track
    m_vecTrack.push_back(qMakePair( 0.0f,  10.0f));
    m_vecTrack.push_back(qMakePair( 0.0f,  200.0f));
    m_vecTrack.push_back(qMakePair( 0.0f,  400.0f));
    m_vecTrack.push_back(qMakePair(-1.0f,  100.0f));
    m_vecTrack.push_back(qMakePair( 0.0f,  200.0f));
    m_vecTrack.push_back(qMakePair(-1.0f,  200.0f));
    m_vecTrack.push_back(qMakePair( 1.0f,  200.0f));
    m_vecTrack.push_back(qMakePair( 0.0f,  200.0f));
    m_vecTrack.push_back(qMakePair( 0.02f, 500.0f));
    m_vecTrack.push_back(qMakePair( 0.0f,  200.0f));

    // Calculate total track distance, so we can set lap times
    for(int i = 0; i < m_vecTrack.size(); ++i)
    {
        m_trackDistance += m_vecTrack[i].second;
    }

    m_listLapTimes = { 0,0,0,0,0 };
    m_currentLapTime = 0.0f;
}

void GameScene::renderGameObjects()
{
    clear();
//Draw Background
    QGraphicsPixmapItem* pItem = new QGraphicsPixmapItem();
    pItem->setPixmap(QPixmap::fromImage(m_image).scaled(SCREEN::PHYSICAL_SIZE));
    pItem->setPos(0,0);
    addItem(pItem);

//Draw Car
    int nCarPos = SCREEN::PHYSICAL_SIZE.width() / 2 + ((int)(SCREEN::PHYSICAL_SIZE.width() * m_carPos) / 2.0) - 7*SCREEN::CELL_SIZE.width(); // Offset for sprite
    QSize carSpriteSize = QSize(14*SCREEN::CELL_SIZE.width(), 6*SCREEN::CELL_SIZE.height());
    int yCarPos = 80*SCREEN::CELL_SIZE.height();
    switch (m_carDirection)
    {
    case 0:
    {
        QGraphicsPixmapItem* pItem = new QGraphicsPixmapItem();
        pItem->setPixmap(m_upCarPixmap.scaled(carSpriteSize));
        pItem->setPos(nCarPos, yCarPos);
        addItem(pItem);
    }
        break;

    case +1:
    {
        QGraphicsPixmapItem* pItem = new QGraphicsPixmapItem();
        pItem->setPixmap(m_rightCarPixmap.scaled(carSpriteSize));
        pItem->setPos(nCarPos, yCarPos);
        addItem(pItem);
    }
        break;

    case -1:
    {
        QGraphicsPixmapItem* pItem = new QGraphicsPixmapItem();
        pItem->setPixmap(m_leftCarPixmap.scaled(carSpriteSize));
        pItem->setPos(nCarPos, yCarPos);
        addItem(pItem);
    }
        break;
    }

    drawString(0,0, "Distance:         " + QString::number(m_distance, 'f', 2) + " m");
    drawString(0,1, "Target Curvature: " + QString::number(m_curvature, 'f', 2));
    drawString(0,2, "Player Curvature: " + QString::number(m_playerCurvature, 'f', 2));
    drawString(0,3, "Player Speed:     " + QString::number(m_speed) + " km/h");
    drawString(0, 4,"Track Curvature:  " + QString::number(m_trackCurvature, 'f', 2));

    auto disp_time = [](float t) // Little lambda to turn floating point seconds into minutes:seconds:millis string
    {
        int nMinutes = t / 60.0f;
        int nSeconds = t - (nMinutes * 60.0f);
        int nMilliSeconds = (t - (float)nSeconds) * 1000.0f;
        if(nMilliSeconds > 100000)
        {
            nMilliSeconds = 99999;
        }
        return QString::number(nMinutes) + "." + QString::number(nSeconds) + ":" + QString::number(nMilliSeconds);
    };
    // Display current laptime
    drawString(0, 5, "LapTime: " + disp_time(m_currentLapTime));

    drawString(0, 6, "Last 5 lap: ");
    for(int i = 0; i < m_listLapTimes.size(); ++i)
    {
        drawString(0, 7+i, disp_time(m_listLapTimes[i]));
    }
}

void GameScene::createPixmap()
{
    int w = 84;
    int h = 36;
    QString pathFile = ":/res/cars.png";
    QPixmap tmp = QPixmap(pathFile);
    m_upCarPixmap = tmp.copy(0,0,w,h);
    m_rightCarPixmap = tmp.copy(w, 0, w, h);
    m_leftCarPixmap = tmp.copy(2*w, 0, w, h);
}

void GameScene::drawString(int x, int y, QString text)
{
    QGraphicsSimpleTextItem* tItem = new QGraphicsSimpleTextItem();
    QFont tFont = tItem->font();
    tFont.setPointSize(SCREEN::CELL_SIZE.height()*3);
    tItem->setFont(tFont);
    tItem->setPos(x*SCREEN::CELL_SIZE.width(), 3*y*SCREEN::CELL_SIZE.height());
    tItem->setBrush(QColor(Qt::white));
    tItem->setPen(QColor(Qt::white));
    tItem->setText(text);
    addItem(tItem);
}

void GameScene::renderGameScene()
{
    static int index = 0;
    QString fileName = QDir::currentPath() + QDir::separator() + "screen" + QString::number(index++) + ".png";
    QRect rect = sceneRect().toAlignedRect();
    QImage image(rect.size(), QImage::Format_ARGB32);
    image.fill(Qt::transparent);
    QPainter painter(&image);
    render(&painter);
    image.save(fileName);
    qDebug() << "saved " << fileName;
}

void GameScene::keyPressEvent(QKeyEvent *event)
{
    if(KEYBOARD::KeysMapper.contains(event->key()))
    {
        m_keys[KEYBOARD::KeysMapper[event->key()]]->m_held = true;
    }
    QGraphicsScene::keyPressEvent(event);
}

void GameScene::keyReleaseEvent(QKeyEvent *event)
{
    if(KEYBOARD::KeysMapper.contains(event->key()))
    {
        m_keys[KEYBOARD::KeysMapper[event->key()]]->m_held = false;
        m_keys[KEYBOARD::KeysMapper[event->key()]]->m_released = true;
    }
    QGraphicsScene::keyReleaseEvent(event);
}

void GameScene::mousePressEvent(QGraphicsSceneMouseEvent *event)
{
    m_mouse->m_x = event->scenePos().x();
    m_mouse->m_y = event->scenePos().y();
    m_mouse->m_pressed = true;
    QGraphicsScene::mousePressEvent(event);
}

void GameScene::mouseMoveEvent(QGraphicsSceneMouseEvent *event)
{
    m_mouse->m_x = event->scenePos().x();
    m_mouse->m_y = event->scenePos().y();
    QGraphicsScene::mouseMoveEvent(event);
}

void GameScene::mouseReleaseEvent(QGraphicsSceneMouseEvent *event)
{
    m_mouse->m_x = event->scenePos().x();
    m_mouse->m_y = event->scenePos().y();
    m_mouse->m_pressed = false;
    m_mouse->m_released = true;
    QGraphicsScene::mouseReleaseEvent(event);
}
