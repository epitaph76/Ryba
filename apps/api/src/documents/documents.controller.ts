import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  createDocumentRequestSchema,
  documentDetailRecordSchema,
  documentIdParamsSchema,
  entityIdParamsSchema,
  listDocumentBacklinksResponseSchema,
  listDocumentsResponseSchema,
  spaceIdParamsSchema,
  updateDocumentRequestSchema,
} from '@ryba/schemas';
import type {
  ApiEnvelope,
  DocumentBacklinkRecord,
  DocumentDetailRecord,
  DocumentRecord,
} from '@ryba/types';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { envelope } from '../common/api-response';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DocumentsService } from './documents.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type DocumentIdParams = z.infer<typeof documentIdParamsSchema>;
type EntityIdParams = z.infer<typeof entityIdParamsSchema>;
type CreateDocumentRequest = z.infer<typeof createDocumentRequestSchema>;
type UpdateDocumentRequest = z.infer<typeof updateDocumentRequestSchema>;
type ListDocumentsResponse = z.infer<typeof listDocumentsResponseSchema>;
type ListDocumentBacklinksResponse = z.infer<typeof listDocumentBacklinksResponseSchema>;

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class DocumentsController {
  constructor(
    @Inject(DocumentsService)
    private readonly documentsService: DocumentsService,
  ) {}

  @Get('spaces/:spaceId/documents')
  async listDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(spaceIdParamsSchema))
    params: SpaceIdParams,
  ): Promise<ApiEnvelope<ListDocumentsResponse>> {
    const items = await this.documentsService.listDocuments(user.userId, params);

    return envelope({
      items,
    });
  }

  @Post('spaces/:spaceId/documents')
  async createDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(spaceIdParamsSchema))
    params: SpaceIdParams,
    @Body(new ZodValidationPipe(createDocumentRequestSchema))
    payload: CreateDocumentRequest,
  ): Promise<ApiEnvelope<DocumentDetailRecord>> {
    const detail = await this.documentsService.createDocument(user.userId, params, payload);
    documentDetailRecordSchema.parse(detail);

    return envelope(detail);
  }

  @Get('documents/:documentId')
  async getDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(documentIdParamsSchema))
    params: DocumentIdParams,
  ): Promise<ApiEnvelope<DocumentDetailRecord>> {
    const detail = await this.documentsService.getDocument(user.userId, params);
    documentDetailRecordSchema.parse(detail);

    return envelope(detail);
  }

  @Patch('documents/:documentId')
  async updateDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(documentIdParamsSchema))
    params: DocumentIdParams,
    @Body(new ZodValidationPipe(updateDocumentRequestSchema))
    payload: UpdateDocumentRequest,
  ): Promise<ApiEnvelope<DocumentDetailRecord>> {
    const detail = await this.documentsService.updateDocument(user.userId, params, payload);
    documentDetailRecordSchema.parse(detail);

    return envelope(detail);
  }

  @Get('entities/:entityId/document-backlinks')
  async listBacklinks(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(entityIdParamsSchema))
    params: EntityIdParams,
  ): Promise<ApiEnvelope<ListDocumentBacklinksResponse>> {
    const items = await this.documentsService.listDocumentBacklinks(user.userId, params);

    return envelope({
      items,
    });
  }
}
