"""
flow_service.py
Google Flow (Vertex AI Imagen 3) image generation.
Requires: google-cloud-aiplatform, GOOGLE_PROJECT_ID, GOOGLE_LOCATION set.
"""
import base64
import os
import config

_model = None


def _get_model():
    global _model
    if _model is None:
        try:
            import vertexai
            from vertexai.vision_models import ImageGenerationModel

            if not config.GOOGLE_PROJECT_ID:
                raise RuntimeError("GOOGLE_PROJECT_ID not set.")

            vertexai.init(
                project=config.GOOGLE_PROJECT_ID,
                location=config.GOOGLE_LOCATION,
            )
            _model = ImageGenerationModel.from_pretrained(config.IMAGEN_MODEL)
        except ImportError:
            raise RuntimeError(
                "google-cloud-aiplatform not installed. "
                "Run: pip install google-cloud-aiplatform"
            )
    return _model


def generate_image(prompt: str, negative_prompt: str = "",
                   aspect_ratio: str = "4:5",
                   number_of_images: int = 1) -> list[dict]:
    """
    Generate images using Imagen 3.
    Returns list of dicts with base64-encoded image data.
    """
    model = _get_model()

    kwargs = {
        "prompt": prompt,
        "number_of_images": number_of_images,
        "aspect_ratio": aspect_ratio,
    }
    if negative_prompt:
        kwargs["negative_prompt"] = negative_prompt

    images = model.generate_images(**kwargs)

    results = []
    for img in images:
        img_bytes = img._image_bytes
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        results.append({
            "base64": b64,
            "mime_type": "image/png",
            "data_uri": f"data:image/png;base64,{b64}",
        })
    return results


def generate_carousel_visuals(slides: list[dict], style: str,
                               brand_colors: list = None) -> list[dict]:
    """
    Generate images for each carousel slide that needs one.
    slides: list of dicts with 'slide_topic' and 'background' fields.
    """
    results = []
    for slide in slides:
        if slide.get("background") == "photo":
            prompt = (
                f"{slide.get('slide_topic', '')}. "
                f"Style: {style}. "
                f"Food photography, warm lighting, {config.DEFAULT_LOCATION} aesthetic, "
                f"editorial, high resolution, no text overlay."
            )
            try:
                imgs = generate_image(prompt, aspect_ratio="4:5", number_of_images=1)
                results.append({"slide_number": slide.get("number"), "image": imgs[0]})
            except Exception as e:
                results.append({"slide_number": slide.get("number"), "error": str(e)})
        else:
            results.append({"slide_number": slide.get("number"), "image": None})
    return results
