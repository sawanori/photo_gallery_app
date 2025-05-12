// src/app/admin/dashboard/page.tsx
'use client';  // ← これをファイル先頭に！

import { useEffect, useState } from 'react';
import API from '../../../lib/api';
import { Card, Row, Col } from 'antd';

export default function DashboardPage() {
  const [images, setImages] = useState<any[]>([]);

  useEffect(() => {
    API.get('/images')
      .then(res => setImages(res.data.items))
      .catch(console.error);
  }, []);

  return (
    <Row gutter={[16, 16]}>
      {images.map(img => (
        <Col key={img.id} span={6}>
          <Card
            hoverable
            cover={<img src={img.url} alt={img.title} />}
          >
            <Card.Meta title={img.title} description={img.description} />
          </Card>
        </Col>
      ))}
    </Row>
  );
}